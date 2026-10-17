//! The list of recently opened folders. Kept as JSON in the app's own config folder, never in a
//! repository or a test case folder.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("folders.json"))
}

#[tauri::command]
pub fn load_folders(app: AppHandle) -> Vec<Folder> {
    file(&app)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_folders(app: AppHandle, folders: Vec<Folder>) -> Result<(), String> {
    let f = file(&app)?;
    if let Some(dir) = f.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&folders).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}
