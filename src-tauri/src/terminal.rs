//! Terminals for the Claude Code panel: one shell per test case folder, running in that folder.
//! The shell starts `claude`, so if Claude Code exits you're still in a shell in the right place.

use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};
#[cfg(not(windows))]
use std::time::{Duration, Instant};

use base64::{Engine, engine::general_purpose::STANDARD as B64};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

struct Session {
    generation: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);

impl Terminals {
    pub fn kill_all(&self) {
        for (_, mut s) in self.0.lock().unwrap().drain() {
            let _ = s.child.kill();
        }
    }
}

static GENERATION: AtomicU64 = AtomicU64::new(1);

/// Output and exit events carry the session's generation, so a restarted terminal can ignore
/// the last words of the one it replaced.
#[derive(Serialize, Clone)]
struct Output {
    id: String,
    generation: u64,
    data: String,
}

#[derive(Serialize, Clone)]
struct Exited {
    id: String,
    generation: u64,
}

#[derive(Serialize)]
pub struct Started {
    generation: u64,
    /// Whether the `claude` command was found. If not, the shell still starts.
    claude: bool,
}

#[cfg(not(windows))]
fn shell() -> (String, Vec<&'static str>) {
    let fallback = if cfg!(target_os = "macos") { "/bin/zsh" } else { "/bin/bash" };
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| fallback.into());
    // A login, interactive shell reads the same profile files as the user's own terminal, so
    // PATH (and with it `claude`) is set up the same way even when the app was started from Finder.
    (shell, vec!["-l", "-i"])
}

#[cfg(windows)]
use std::process::{Command, Stdio};

#[cfg(windows)]
fn shell() -> (String, Vec<&'static str>) {
    use std::os::windows::process::CommandExt;
    let pwsh = Command::new("where.exe")
        .arg("pwsh.exe")
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let exe = if pwsh.map(|s| s.success()).unwrap_or(false) { "pwsh.exe" } else { "powershell.exe" };
    (exe.into(), vec!["-NoLogo"])
}

/// Asks the user's shell whether `claude` is on its PATH. The shell runs in a terminal of its own,
/// so it reads the same profile files and behaves as it does in the user's terminal app. Gives the
/// benefit of the doubt if the shell takes too long to answer.
fn claude_installed(dir: &Path) -> bool {
    #[cfg(not(windows))]
    {
        let (shell, args) = shell();
        let mut cmd = CommandBuilder::new(shell);
        cmd.args(args);
        cmd.args(["-c", "command -v claude"]);
        cmd.cwd(dir);
        let Ok(pair) = native_pty_system().openpty(PtySize::default()) else { return true };
        let Ok(mut child) = pair.slave.spawn_command(cmd) else { return true };
        drop(pair.slave);
        // Drain the output so a chatty profile can't fill the buffer and stall the shell.
        if let Ok(mut reader) = pair.master.try_clone_reader() {
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                while matches!(reader.read(&mut buf), Ok(n) if n > 0) {}
            });
        }
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            match child.try_wait() {
                Ok(Some(status)) => return status.success(),
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(_) => return true,
            }
        }
        let _ = child.kill();
        true
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let status = Command::new("where.exe")
            .arg("claude")
            .current_dir(dir)
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        status.map(|s| s.success()).unwrap_or(true)
    }
}

/// Starts the terminal for a folder, unless it's already running. `id` is the folder's path.
#[tauri::command]
pub async fn term_start(app: AppHandle, terms: State<'_, Terminals>, id: String, cols: u16, rows: u16) -> Result<Started, String> {
    let dir = dunce::canonicalize(&id).map_err(|e| format!("Couldn't find {id} ({e})"))?;
    if let Some(s) = terms.0.lock().unwrap().get(&id) {
        return Ok(Started { generation: s.generation, claude: true });
    }
    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let (shell, args) = shell();
    let mut cmd = CommandBuilder::new(shell);
    cmd.args(args);
    cmd.cwd(&dir);
    // If Stepwise itself was started from inside a Claude Code session, don't pass that session's
    // markers on: this Claude Code is a session of its own. (The login shell sets up the user's
    // own Claude Code settings again from their profile.)
    for (key, _) in std::env::vars_os() {
        let k = key.to_string_lossy();
        if k == "CLAUDECODE" || k == "CLAUDE_PID" || k.starts_with("CLAUDE_CODE_") || k.starts_with("CLAUDE_AGENT_SDK_") {
            cmd.env_remove(&key);
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("Couldn't start a shell: {e}"))?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst);
    terms.0.lock().unwrap().insert(id.clone(), Session { generation, master: pair.master, writer, child });

    let (app2, id2) = (app.clone(), id.clone());
    thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = app2.emit("term-output", Output { id: id2.clone(), generation, data: B64.encode(&buf[..n]) });
                }
            }
        }
        let _ = app2.emit("term-exited", Exited { id: id2, generation });
    });

    let claude = tauri::async_runtime::spawn_blocking(move || claude_installed(&dir)).await.unwrap_or(true);
    if claude {
        let mut map = terms.0.lock().unwrap();
        if let Some(s) = map.get_mut(&id).filter(|s| s.generation == generation) {
            let _ = s.writer.write_all(b"claude\r");
        }
    }
    Ok(Started { generation, claude })
}

#[tauri::command]
pub fn term_write(terms: State<Terminals>, id: String, data: String) -> Result<(), String> {
    let mut map = terms.0.lock().unwrap();
    let s = map.get_mut(&id).ok_or("The terminal isn't running")?;
    s.writer.write_all(data.as_bytes()).and_then(|_| s.writer.flush()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_resize(terms: State<Terminals>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = terms.0.lock().unwrap();
    let s = map.get(&id).ok_or("The terminal isn't running")?;
    s.master
        .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

/// Ends the folder's shell (and Claude Code with it). Starting again gives a fresh one.
#[tauri::command]
pub fn term_kill(terms: State<Terminals>, id: String) {
    let session = terms.0.lock().unwrap().remove(&id);
    if let Some(mut s) = session {
        let _ = s.child.kill();
        thread::spawn(move || {
            let _ = s.child.wait();
        });
    }
}

/// Forgets a session whose shell has exited on its own (the user typed `exit`).
#[tauri::command]
pub fn term_ended(terms: State<Terminals>, id: String, generation: u64) {
    let mut map = terms.0.lock().unwrap();
    if map.get(&id).is_some_and(|s| s.generation == generation) {
        if let Some(mut s) = map.remove(&id) {
            thread::spawn(move || {
                let _ = s.child.wait();
            });
        }
    }
}
