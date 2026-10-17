mod folders;
mod terminal;
mod workspace;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Set once the window has saved its last edits, so closing goes ahead.
static CAN_CLOSE: AtomicBool = AtomicBool::new(false);
/// Set when the window answers "close-requested", so the fallback below leaves the closing to it.
static CLOSE_HELD: AtomicBool = AtomicBool::new(false);

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

/// Copies text, plus a formatted (HTML) version when given, so bold and italic survive a paste
/// into Azure DevOps.
#[tauri::command]
fn copy_text(app: AppHandle, text: String, html: Option<String>) -> Result<(), String> {
    match html {
        Some(html) => app.clipboard().write_html(html, Some(text)),
        None => app.clipboard().write_text(text),
    }
    .map_err(|e| e.to_string())
}

/// Opens a web link (an ADO work item, the Claude Code docs) in the default browser.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Called by the window as soon as it gets "close-requested": it may need to ask you something
/// (a conflict, edits that couldn't be saved) before it closes.
#[tauri::command]
fn hold_close() {
    CLOSE_HELD.store(true, Ordering::SeqCst);
}

/// Called by the window once it has saved, in answer to "close-requested".
#[tauri::command]
fn quit(app: AppHandle) {
    CAN_CLOSE.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// Instead of closing straight away, let the window save its last edits. If it doesn't answer
/// within a few seconds (it's stuck), close anyway.
fn request_close(app: &AppHandle) {
    CLOSE_HELD.store(false, Ordering::SeqCst);
    let _ = app.emit("close-requested", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        if !CLOSE_HELD.load(Ordering::SeqCst) {
            CAN_CLOSE.store(true, Ordering::SeqCst);
            app.exit(0);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(workspace::Workspace::default())
        .manage(terminal::Terminals::default())
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
            copy_text,
            open_url,
            hold_close,
            quit,
            folders::load_folders,
            folders::save_folders,
            folders::load_review,
            folders::save_review,
            workspace::folder_info,
            workspace::open_workspace,
            workspace::close_workspace,
            workspace::read_text,
            workspace::write_text,
            workspace::remove_file,
            workspace::file_exists,
            terminal::term_start,
            terminal::term_write,
            terminal::term_resize,
            terminal::term_kill,
            terminal::term_at_prompt,
            terminal::term_ended,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting Stepwise")
        .run(|app, event| match event {
            RunEvent::ExitRequested { api, code: None, .. } if !CAN_CLOSE.load(Ordering::SeqCst) => {
                api.prevent_exit();
                request_close(app);
            }
            RunEvent::Exit => app.state::<terminal::Terminals>().kill_all(),
            _ => {}
        });
}
