//! The list of recently opened folders. Kept as JSON in the app's own config folder, never in a
//! repository or a test case folder.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::workspace::Allowed;

#[derive(Serialize, Deserialize, Clone)]
pub struct Folder {
    path: String,
    #[serde(default)]
    label: String,
    /// When it was last opened, in milliseconds since 1970.
    #[serde(default)]
    opened: u64,
    /// The case (or view) that was selected there last.
    #[serde(default)]
    sel: Option<serde_json::Value>,
    #[serde(default)]
    cases: u32,
    /// The ADO project, e.g. "contoso / expenses".
    #[serde(default)]
    ado: String,
    /// Whether you agreed to add the AI instruction files (AGENTS.md, CLAUDE.md and the Claude
    /// commands); unset until asked. Named for when they were only for Claude.
    #[serde(default, rename = "claudeFiles", skip_serializing_if = "Option::is_none")]
    claude_files: Option<bool>,
    /// The version of those files you were last asked about, so an update is offered only once.
    #[serde(default, rename = "filesVersion", skip_serializing_if = "Option::is_none")]
    files_version: Option<u32>,
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("folders.json"))
}

#[tauri::command]
pub fn load_folders(app: AppHandle, allowed: State<Allowed>) -> Vec<Folder> {
    let folders: Vec<Folder> = file(&app)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    for f in &folders {
        allowed.allow(&f.path);
    }
    folders
}

#[tauri::command]
pub fn save_folders(app: AppHandle, allowed: State<Allowed>, folders: Vec<Folder>) -> Result<(), String> {
    // Only folders that were chosen in the dialog or were already on the list.
    let folders: Vec<Folder> = folders.into_iter().filter(|f| allowed.contains(&f.path)).collect();
    let f = file(&app)?;
    if let Some(dir) = f.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&folders).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

/// Changes made outside the app that you haven't kept or undone yet, per folder, so they survive
/// switching folders and quitting. Stored next to the folder list, never in the folder itself.
fn review_file(app: &AppHandle, folder: &str) -> Result<PathBuf, String> {
    // FNV-1a: a stable, short file name for the folder's path.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in folder.as_bytes() {
        hash = (hash ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3);
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("reviews");
    Ok(dir.join(format!("{hash:016x}.json")))
}

#[derive(Serialize, Deserialize, Default)]
pub struct Review {
    folder: String,
    entries: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
pub fn load_review(app: AppHandle, folder: String) -> serde_json::Map<String, serde_json::Value> {
    review_file(&app, &folder)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<Review>(&t).ok())
        .filter(|r| r.folder == folder)
        .map(|r| r.entries)
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_review(app: AppHandle, folder: String, entries: serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let f = review_file(&app, &folder)?;
    if entries.is_empty() {
        return match fs::remove_file(&f) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    fs::create_dir_all(f.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string(&Review { folder, entries }).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}
