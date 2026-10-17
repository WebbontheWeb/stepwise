//! Handing the open folder over to the user's own AI assistant (Claude Desktop, Claude Code in a
//! terminal, or Codex) through the deep link each one registers with the system. Stepwise builds
//! the link itself from a fixed list, so the window can't open any other kind of link. The chosen
//! assistant is kept in the app's own config folder, never in a test case folder.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::workspace::Workspace;

/// The longest prefilled prompt. Claude Code's links take up to 5,000 characters; the prompts
/// Stepwise sends are a few lines, and anything long (a transcript) goes in a file instead.
const MAX_PROMPT: usize = 4000;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Assistant {
    /// The Claude desktop app: `claude://code/new?folder=…&q=…`
    Claude,
    /// Claude Code in a terminal: `claude-cli://open?cwd=…&q=…`
    ClaudeCode,
    /// The Codex app: `codex://new?path=…&prompt=…`
    Codex,
}

impl Assistant {
    fn scheme(self) -> &'static str {
        match self {
            Assistant::Claude => "claude",
            Assistant::ClaudeCode => "claude-cli",
            Assistant::Codex => "codex",
        }
    }

    fn link(self, folder: &str, prompt: &str) -> String {
        let (base, folder_key, prompt_key) = match self {
            Assistant::Claude => ("claude://code/new", "folder", "q"),
            Assistant::ClaudeCode => ("claude-cli://open", "cwd", "q"),
            Assistant::Codex => ("codex://new", "path", "prompt"),
        };
        let mut url = format!("{base}?{folder_key}={}", encode(folder));
        if !prompt.is_empty() {
            url.push_str(&format!("&{prompt_key}={}", encode(prompt)));
        }
        url
    }
}

/// Percent-encodes everything but unreserved characters, like JavaScript's encodeURIComponent.
fn encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[derive(Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    assistant: Option<Assistant>,
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Settings {
    settings_file(&app)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let f = settings_file(&app)?;
    fs::create_dir_all(f.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

/// Whether some app has registered the link's scheme. On macOS, opening the link reports that
/// itself. On Windows and Linux opening an unknown link may fail silently or show the system's
/// "find an app" prompt, so check first. When the check itself can't run, assume yes.
fn installed(assistant: Assistant) -> bool {
    let scheme = assistant.scheme();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        return std::process::Command::new("reg")
            .args(["query", &format!(r"HKCR\{scheme}"), "/v", "URL Protocol"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_or(true, |o| o.status.success());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return std::process::Command::new("xdg-mime")
            .args(["query", "default", &format!("x-scheme-handler/{scheme}")])
            .output()
            .map_or(true, |o| !o.status.success() || !String::from_utf8_lossy(&o.stdout).trim().is_empty());
    }
    #[allow(unreachable_code)]
    {
        let _ = scheme;
        true
    }
}

/// Opens the folder that's open in Stepwise in the chosen assistant, with `prompt` typed in but
/// not sent. Fails with "not-installed" when nothing handles the assistant's links.
#[tauri::command]
pub fn open_assistant(app: AppHandle, ws: State<Workspace>, assistant: Assistant, prompt: String) -> Result<(), String> {
    let prompt: String = prompt.chars().filter(|c| *c == '\n' || !c.is_control()).collect();
    if prompt.chars().count() > MAX_PROMPT {
        return Err("The prompt is too long for a link".into());
    }
    let folder = ws.root()?;
    if !installed(assistant) {
        return Err("not-installed".into());
    }
    let url = assistant.link(&crate::workspace::display(&folder), &prompt);
    // On macOS this waits for `open`, which fails when no app claims the scheme.
    app.opener().open_url(url, None::<&str>).map_err(|_| "not-installed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links() {
        assert_eq!(
            Assistant::Claude.link("/Users/me/Test cases", "Review cases/a.md\nthen stop"),
            "claude://code/new?folder=%2FUsers%2Fme%2FTest%20cases&q=Review%20cases%2Fa.md%0Athen%20stop"
        );
        assert_eq!(Assistant::ClaudeCode.link(r"C:\Tests", ""), "claude-cli://open?cwd=C%3A%5CTests");
        assert_eq!(Assistant::Codex.link("/t", "a&b=c"), "codex://new?path=%2Ft&prompt=a%26b%3Dc");
        assert_eq!(encode("é#?"), "%C3%A9%23%3F");
    }

    #[test]
    fn settings_names() {
        let s: Settings = serde_json::from_str(r#"{"assistant":"claude-code"}"#).unwrap();
        assert_eq!(s.assistant, Some(Assistant::ClaudeCode));
        assert!(serde_json::from_str::<Settings>(r#"{"assistant":"https"}"#).is_err());
        assert!(serde_json::from_str::<Settings>("{}").unwrap().assistant.is_none());
    }
}
