mod folders;
mod workspace;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Set once the window has saved its last edits, so closing goes ahead.
static CAN_CLOSE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().set_title("Choose a folder for your test cases").blocking_pick_folder()?;
    picked.into_path().ok().map(|p| workspace::display(&p))
}

/// Asks where to save an export and writes it there. Returns the chosen path, or None if cancelled.
#[tauri::command]
async fn export_file(app: AppHandle, name: String, text: String) -> Result<Option<String>, String> {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_default();
    let mut dialog = app.dialog().file().set_file_name(&name);
    if !ext.is_empty() {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    let Some(picked) = dialog.blocking_save_file() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(Some(workspace::display(&path)))
}

/// Opens a web link (an ADO work item, the Claude Code docs) in the default browser.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Called by the window once it has saved, in answer to "close-requested".
#[tauri::command]
fn quit(app: AppHandle) {
    CAN_CLOSE.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// Instead of closing straight away, give the window a moment to save its last edits.
fn request_close(app: &AppHandle) {
    let _ = app.emit("close-requested", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        CAN_CLOSE.store(true, Ordering::SeqCst);
        app.exit(0);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(workspace::Workspace::default())
        .setup(|app| {
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !CAN_CLOSE.load(Ordering::SeqCst) {
                    api.prevent_close();
                    request_close(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            export_file,
            open_url,
            quit,
            folders::load_folders,
            folders::save_folders,
            workspace::folder_info,
            workspace::open_workspace,
            workspace::close_workspace,
            workspace::read_text,
            workspace::write_text,
            workspace::remove_file,
            workspace::file_exists,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting Stepwise")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                if !CAN_CLOSE.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_close(app);
                }
            }
        });
}
