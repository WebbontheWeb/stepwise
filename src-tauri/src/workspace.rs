//! The open test case folder: reading and writing files inside it, and watching it for changes
//! made outside the app (by Claude Code, a teammate, or git).

use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::{self, Write},
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer, notify::RecommendedWatcher, notify::RecursiveMode};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Text of each data file (cases/*.md, blocks/*.md, stepwise.json) as the app last read or wrote it.
/// The watcher compares the disk against this, so the app's own writes never count as outside changes.
type Known = Arc<Mutex<HashMap<String, String>>>;

struct Open {
    root: PathBuf,
    known: Known,
    _watcher: Debouncer<RecommendedWatcher>,
}

#[derive(Default)]
pub struct Workspace(Mutex<Option<Open>>);

impl Workspace {
    fn with<T>(&self, f: impl FnOnce(&Open) -> Result<T, String>) -> Result<T, String> {
        let guard = self.0.lock().unwrap();
        let open = guard.as_ref().ok_or("No folder is open")?;
        f(open)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    path: String,
    name: String,
    set_up: bool,
}

#[derive(Serialize)]
pub struct Opened {
    path: String,
    name: String,
    files: BTreeMap<String, String>,
}

#[derive(Serialize, Clone)]
pub struct Change {
    path: String,
    before: Option<String>,
    after: Option<String>,
}

#[derive(Serialize, Clone)]
struct Changed {
    root: String,
    changes: Vec<Change>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

pub fn display(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

fn folder_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| display(p))
}

fn canonical_dir(path: &str) -> Result<PathBuf, String> {
    let p = dunce::canonicalize(path).map_err(|e| format!("Couldn't find {path} ({e})"))?;
    if !p.is_dir() {
        return Err(format!("{path} isn't a folder"));
    }
    Ok(p)
}

fn is_data(rel: &str) -> bool {
    if rel == "stepwise.json" {
        return true;
    }
    let mut parts = rel.split('/');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some("cases" | "blocks"), Some(name), None)
            if name.ends_with(".md") && !name.starts_with('.') && !name.chars().any(char::is_control)
    )
}

/// The data files in a folder: cases/*.md, blocks/*.md and stepwise.json.
fn scan(root: &Path) -> io::Result<BTreeMap<String, String>> {
    let mut out = BTreeMap::new();
    for sub in ["cases", "blocks"] {
        if resolve(root, sub).is_err() {
            continue;
        }
        let entries = match fs::read_dir(root.join(sub)) {
            Ok(e) => e,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e),
        };
        for entry in entries {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let rel = format!("{sub}/{name}");
            // Only real files inside the folder: a symlink could point anywhere.
            if !is_data(&rel) || !entry.file_type()?.is_file() || resolve(root, &rel).is_err() {
                continue;
            }
            out.insert(rel, read_lossy(&entry.path())?);
        }
    }
    let settings = root.join("stepwise.json");
    if fs::symlink_metadata(&settings).is_ok_and(|m| m.is_file()) {
        out.insert("stepwise.json".into(), read_lossy(&settings)?);
    }
    Ok(out)
}

fn read_lossy(p: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(p)?).into_owned())
}

/// Turns a path relative to the folder into a full path, refusing absolute paths, `..`, and
/// anything (such as a symlink) that resolves outside the folder.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || rel.contains('\0') || p.is_absolute() || p.has_root() {
        return Err(format!("Not a path inside the folder: {rel}"));
    }
    if !p.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err(format!("Not a path inside the folder: {rel}"));
    }
    let full = root.join(p);
    let mut existing = full.as_path();
    while fs::symlink_metadata(existing).is_err() {
        existing = existing.parent().ok_or("Path has no parent")?;
    }
    let real = dunce::canonicalize(existing).map_err(err)?;
    if !real.starts_with(root) {
        return Err(format!("{rel} is outside the folder"));
    }
    Ok(full)
}

/// Writes through a new, randomly named temporary file and a rename, so nobody ever reads a
/// half-written file and nothing already at the temporary path gets followed or overwritten.
fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    let dir = path.parent().ok_or_else(|| io::Error::other("Path has no parent"))?;
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::Builder::new().prefix(".stepwise-").suffix(".tmp").tempfile_in(dir)?;
    tmp.write_all(text.as_bytes())?;
    tmp.persist(path).map(|_| ()).map_err(|e| e.error)
}

fn watch(app: AppHandle, root: PathBuf, known: Known) -> Result<Debouncer<RecommendedWatcher>, String> {
    let r = root.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(300), move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let relevant = events.iter().any(|e| match e.path.strip_prefix(&r) {
            Ok(rel) => matches!(
                rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).as_deref(),
                Some("cases" | "blocks" | "stepwise.json")
            ),
            Err(_) => true,
        });
        if !relevant {
            return;
        }
        let mut known = known.lock().unwrap();
        let Ok(now) = scan(&r) else { return };
        let mut changes = Vec::new();
        for (path, text) in &now {
            if known.get(path) != Some(text) {
                changes.push(Change { path: path.clone(), before: known.get(path).cloned(), after: Some(text.clone()) });
            }
        }
        for (path, text) in known.iter() {
            if !now.contains_key(path) {
                changes.push(Change { path: path.clone(), before: Some(text.clone()), after: None });
            }
        }
        if changes.is_empty() {
            return;
        }
        *known = now.into_iter().collect();
        let _ = app.emit("workspace-changed", Changed { root: display(&r), changes });
    })
    .map_err(err)?;
    debouncer.watcher().watch(&root, RecursiveMode::Recursive).map_err(err)?;
    Ok(debouncer)
}

#[tauri::command]
pub fn folder_info(path: String) -> Result<FolderInfo, String> {
    let root = canonical_dir(&path)?;
    let set_up = !scan(&root).map_err(err)?.is_empty();
    Ok(FolderInfo { path: display(&root), name: folder_name(&root), set_up })
}

/// Makes `path` the open folder, starts watching it, and returns its data files.
/// With `setup`, first adds cases/, blocks/ and stepwise.json where they're missing.
#[tauri::command]
pub fn open_workspace(app: AppHandle, ws: State<Workspace>, path: String, setup: bool) -> Result<Opened, String> {
    let root = canonical_dir(&path)?;
    if setup {
        fs::create_dir_all(root.join("cases")).map_err(err)?;
        fs::create_dir_all(root.join("blocks")).map_err(err)?;
        let settings = root.join("stepwise.json");
        if !settings.exists() {
            write_atomic(&settings, "{\n  \"adoBaseUrl\": \"\"\n}\n").map_err(err)?;
        }
    }
    let files = scan(&root).map_err(|e| format!("Couldn't read {} ({e})", display(&root)))?;
    let known: Known = Arc::new(Mutex::new(files.clone().into_iter().collect()));
    let mut guard = ws.0.lock().unwrap();
    *guard = None; // stop watching the previous folder first
    let watcher = watch(app, root.clone(), known.clone())?;
    *guard = Some(Open { root: root.clone(), known, _watcher: watcher });
    Ok(Opened { path: display(&root), name: folder_name(&root), files })
}

#[tauri::command]
pub fn close_workspace(ws: State<Workspace>) {
    *ws.0.lock().unwrap() = None;
}

#[tauri::command]
pub fn read_text(ws: State<Workspace>, path: String) -> Result<Option<String>, String> {
    ws.with(|o| {
        let full = resolve(&o.root, &path)?;
        match read_lossy(&full) {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(err(e)),
        }
    })
}

/// Writes a file in the open folder. For data files, refuses with "changed-on-disk" if the file
/// changed outside the app since the app last saw it; the watcher then delivers that change instead.
#[tauri::command]
pub fn write_text(ws: State<Workspace>, path: String, text: String) -> Result<(), String> {
    ws.with(|o| {
        let full = resolve(&o.root, &path)?;
        if !is_data(&path) {
            return write_atomic(&full, &text).map_err(err);
        }
        let mut known = o.known.lock().unwrap();
        let disk = read_lossy(&full).ok();
        if disk.as_ref() != known.get(&path) && disk.as_ref() != Some(&text) {
            return Err("changed-on-disk".into());
        }
        write_atomic(&full, &text).map_err(err)?;
        known.insert(path, text);
        Ok(())
    })
}

#[tauri::command]
pub fn remove_file(ws: State<Workspace>, path: String) -> Result<(), String> {
    ws.with(|o| {
        let full = resolve(&o.root, &path)?;
        let mut known = o.known.lock().unwrap();
        match fs::remove_file(&full) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(err(e)),
        }
        known.remove(&path);
        Ok(())
    })
}

#[tauri::command]
pub fn file_exists(ws: State<Workspace>, path: String) -> Result<bool, String> {
    ws.with(|o| Ok(resolve(&o.root, &path)?.exists()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_stays_inside() {
        let dir = std::env::temp_dir().join(format!("stepwise-test-{}", std::process::id()));
        fs::create_dir_all(dir.join("cases")).unwrap();
        let root = dunce::canonicalize(&dir).unwrap();
        assert!(resolve(&root, "cases/a.md").is_ok());
        assert!(resolve(&root, "new/dir/b.md").is_ok());
        assert!(resolve(&root, "./AGENTS.md").is_ok());
        for bad in ["", "../x", "cases/../../x", "/etc/passwd", "cases/../../../etc"] {
            assert!(resolve(&root, bad).is_err(), "{bad}");
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(std::env::temp_dir(), root.join("out")).unwrap();
            assert!(resolve(&root, "out/x.md").is_err());
            fs::write(root.join("cases/ok.md"), "ok").unwrap();
            std::os::unix::fs::symlink("/etc/hosts", root.join("cases/evil.md")).unwrap();
            assert_eq!(scan(&root).unwrap().keys().collect::<Vec<_>>(), ["cases/ok.md"]);
            write_atomic(&root.join("cases/ok.md"), "new").unwrap();
            assert_eq!(fs::read_to_string(root.join("cases/ok.md")).unwrap(), "new");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn data_paths() {
        assert!(is_data("cases/a.md"));
        assert!(is_data("blocks/b.md"));
        assert!(is_data("stepwise.json"));
        assert!(!is_data("cases/.a.md.stepwise-tmp"));
        assert!(!is_data("cases/sub/a.md"));
        assert!(!is_data("AGENTS.md"));
        assert!(!is_data("cases/x\rrm -rf ~.md"));
    }
}
