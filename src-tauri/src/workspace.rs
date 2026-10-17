//! The open test case folder: reading and writing files inside it, and watching it for changes
//! made outside the app (by an AI assistant, a teammate, or git).

use std::{
    collections::{BTreeMap, HashMap, HashSet},
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
    _watcher: Option<Watcher>,
}

#[derive(Default)]
pub struct Workspace(Mutex<Option<Open>>);

/// Folders the window may open: ones chosen in the folder dialog or already in the saved folder
/// list. The window can't point the app at any other path.
#[derive(Default)]
pub struct Allowed(Mutex<HashSet<PathBuf>>);

impl Allowed {
    pub fn allow(&self, path: &str) {
        let mut set = self.0.lock().unwrap();
        set.insert(PathBuf::from(path));
        if let Ok(p) = dunce::canonicalize(path) {
            set.insert(p);
        }
    }

    pub fn contains(&self, path: &str) -> bool {
        let set = self.0.lock().unwrap();
        set.contains(Path::new(path)) || dunce::canonicalize(path).is_ok_and(|p| set.contains(&p))
    }

    pub fn check(&self, path: &str) -> Result<(), String> {
        if self.contains(path) { Ok(()) } else { Err(format!("{path} wasn't chosen as a folder")) }
    }
}

impl Workspace {
    fn with<T>(&self, f: impl FnOnce(&Open) -> Result<T, String>) -> Result<T, String> {
        let guard = self.0.lock().unwrap();
        let open = guard.as_ref().ok_or("No folder is open")?;
        f(open)
    }

    /// The folder that's open.
    pub fn root(&self) -> Result<PathBuf, String> {
        self.with(|o| Ok(o.root.clone()))
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
    /// Files that couldn't be read.
    skipped: Vec<String>,
    /// Set if changes made outside the app can't be watched for.
    watch_error: Option<String>,
}

#[derive(Serialize, Clone)]
struct Watching {
    root: String,
    error: String,
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

/// The data files in a folder (cases/*.md, blocks/*.md and stepwise.json), plus the paths of any
/// that couldn't be read. One unreadable file doesn't stop the rest from loading.
struct Scan {
    files: BTreeMap<String, String>,
    skipped: Vec<String>,
}

fn scan(root: &Path) -> Scan {
    let mut out = Scan { files: BTreeMap::new(), skipped: Vec::new() };
    for sub in ["cases", "blocks"] {
        if resolve(root, sub).is_err() {
            continue;
        }
        let entries = match fs::read_dir(root.join(sub)) {
            Ok(e) => e,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(_) => {
                out.skipped.push(format!("{sub}/"));
                continue;
            }
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let rel = format!("{sub}/{name}");
            // Only real files inside the folder: a symlink could point anywhere.
            if !is_data(&rel) || !entry.file_type().is_ok_and(|t| t.is_file()) || resolve(root, &rel).is_err() {
                continue;
            }
            match read_lossy(&entry.path()) {
                Ok(text) => {
                    out.files.insert(rel, text);
                }
                Err(_) => out.skipped.push(rel),
            }
        }
    }
    let settings = root.join("stepwise.json");
    if fs::symlink_metadata(&settings).is_ok_and(|m| m.is_file()) {
        match read_lossy(&settings) {
            Ok(text) => {
                out.files.insert("stepwise.json".into(), text);
            }
            Err(_) => out.skipped.push("stepwise.json".into()),
        }
    }
    out
}

fn read_lossy(p: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(p)?).into_owned())
}

/// A file's text, or None if there's no such file. Other errors (no permission) are errors.
fn read_opt(p: &Path) -> io::Result<Option<String>> {
    match read_lossy(p) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Returned when a data file on disk isn't the text the edit was based on.
const CONFLICT: &str = "changed-on-disk";

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
/// The file keeps its permissions; a new file gets the usual ones (not tempfile's owner-only
/// default), so teammates sharing the folder can still read it.
fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    let dir = path.parent().ok_or_else(|| io::Error::other("Path has no parent"))?;
    fs::create_dir_all(dir)?;
    let mut builder = tempfile::Builder::new();
    builder.prefix(".stepwise-").suffix(".tmp");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o666)); // narrowed by the umask
    }
    let mut tmp = builder.tempfile_in(dir)?;
    if let Ok(meta) = fs::metadata(path) {
        tmp.as_file().set_permissions(meta.permissions())?;
    }
    tmp.write_all(text.as_bytes())?;
    tmp.persist(path).map(|_| ()).map_err(|e| e.error)
}

/// The live watcher, plus which cases/ and blocks/ folders it watches (by identity, so a folder
/// that's replaced, as in a git checkout, is noticed).
struct Watches {
    debouncer: Debouncer<RecommendedWatcher>,
    subfolders: Subfolders,
}

type Watcher = Arc<Mutex<Option<Watches>>>;
type Subfolders = HashMap<PathBuf, Option<u128>>;

/// Something that tells one folder from another at the same path: the inode on Unix, the
/// creation time elsewhere.
fn dir_id(path: &Path) -> Option<u128> {
    let meta = fs::symlink_metadata(path).ok().filter(|m| m.is_dir())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some((u128::from(meta.dev()) << 64) | u128::from(meta.ino()))
    }
    #[cfg(not(unix))]
    {
        meta.created().ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_nanos())
    }
}

/// Which of cases/ and blocks/ need their watch changed: (folder, unwatch the old one, watch it).
/// Records the new state in `watched`. Folders that are still the same need nothing, because
/// re-adding a watch restarts the macOS event stream (missing events) and duplicates the path.
fn subfolder_updates(root: &Path, watched: &mut Subfolders) -> Vec<(PathBuf, bool, bool)> {
    let mut out = Vec::new();
    for sub in ["cases", "blocks"] {
        let dir = root.join(sub);
        let now = dir_id(&dir);
        let before = watched.get(&dir).copied().flatten();
        if now != before {
            out.push((dir.clone(), before.is_some(), now.is_some()));
            watched.insert(dir, now);
        }
    }
    out
}

fn update_subfolders(w: &mut Watches, root: &Path) {
    for (dir, unwatch, watch) in subfolder_updates(root, &mut w.subfolders) {
        if unwatch {
            let _ = w.debouncer.watcher().unwatch(&dir);
        }
        if watch && w.debouncer.watcher().watch(&dir, RecursiveMode::NonRecursive).is_err() {
            w.subfolders.insert(dir, None); // try again on the next event for it
        }
    }
}

/// Watches the folder itself (for stepwise.json, and cases/ or blocks/ being replaced) and cases/
/// and blocks/, not everything under it: a big folder could use up Linux's limit on watches.
/// Problems are reported to the window as "watch-error".
fn watch(app: AppHandle, root: PathBuf, known: Known) -> Result<Watcher, String> {
    let shared: Watcher = Arc::new(Mutex::new(None));
    let weak = Arc::downgrade(&shared);
    let r = root.clone();
    let (cases_dir, blocks_dir) = (root.join("cases"), root.join("blocks"));
    let debouncer = new_debouncer(Duration::from_millis(300), move |res: DebounceEventResult| {
        let events = match res {
            Ok(events) => events,
            Err(e) => {
                let _ = app.emit("watch-error", Watching { root: display(&r), error: e.to_string() });
                return;
            }
        };
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
        // cases/ or blocks/ itself was created, removed or replaced: update those watches.
        if events.iter().any(|e| e.path == cases_dir || e.path == blocks_dir) {
            if let Some(shared) = weak.upgrade() {
                if let Ok(mut guard) = shared.try_lock() {
                    if let Some(w) = guard.as_mut() {
                        update_subfolders(w, &r);
                    }
                }
            }
        }
        let mut known = known.lock().unwrap();
        let Scan { mut files, skipped } = scan(&r);
        // A file that couldn't be read right now (locked mid-write) hasn't changed as far as we know.
        for path in &skipped {
            if let Some(text) = known.get(path) {
                files.insert(path.clone(), text.clone());
            }
        }
        let mut changes = Vec::new();
        for (path, text) in &files {
            if known.get(path) != Some(text) {
                changes.push(Change { path: path.clone(), before: known.get(path).cloned(), after: Some(text.clone()) });
            }
        }
        for (path, text) in known.iter() {
            if !files.contains_key(path) {
                changes.push(Change { path: path.clone(), before: Some(text.clone()), after: None });
            }
        }
        if changes.is_empty() {
            return;
        }
        *known = files.into_iter().collect();
        let _ = app.emit("workspace-changed", Changed { root: display(&r), changes });
    })
    .map_err(err)?;
    {
        let mut guard = shared.lock().unwrap();
        let w = guard.insert(Watches { debouncer, subfolders: HashMap::new() });
        w.debouncer.watcher().watch(&root, RecursiveMode::NonRecursive).map_err(err)?;
        update_subfolders(w, &root);
    }
    Ok(shared)
}

#[tauri::command]
pub fn folder_info(allowed: State<Allowed>, path: String) -> Result<FolderInfo, String> {
    allowed.check(&path)?;
    let root = canonical_dir(&path)?;
    let found = scan(&root);
    let set_up = !found.files.is_empty() || !found.skipped.is_empty();
    Ok(FolderInfo { path: display(&root), name: folder_name(&root), set_up })
}

/// Makes `path` the open folder, starts watching it, and returns its data files.
/// With `setup`, first adds cases/, blocks/ and stepwise.json where they're missing.
#[tauri::command]
pub fn open_workspace(app: AppHandle, ws: State<Workspace>, allowed: State<Allowed>, path: String, setup: bool) -> Result<Opened, String> {
    allowed.check(&path)?;
    let root = canonical_dir(&path)?;
    if setup {
        fs::create_dir_all(root.join("cases")).map_err(err)?;
        fs::create_dir_all(root.join("blocks")).map_err(err)?;
        let settings = root.join("stepwise.json");
        if !settings.exists() {
            write_atomic(&settings, "{\n  \"adoBaseUrl\": \"\"\n}\n").map_err(err)?;
        }
    }
    let Scan { files, skipped } = scan(&root);
    let known: Known = Arc::new(Mutex::new(files.clone().into_iter().collect()));
    // Nothing can fail from here on, so a folder that doesn't open leaves the previous one open.
    let (watcher, watch_error) = match watch(app, root.clone(), known.clone()) {
        Ok(w) => (Some(w), None),
        Err(e) => (None, Some(e)),
    };
    *ws.0.lock().unwrap() = Some(Open { root: root.clone(), known, _watcher: watcher });
    Ok(Opened { path: display(&root), name: folder_name(&root), files, skipped, watch_error })
}

#[tauri::command]
pub fn close_workspace(ws: State<Workspace>) {
    *ws.0.lock().unwrap() = None;
}

#[tauri::command]
pub fn read_text(ws: State<Workspace>, path: String) -> Result<Option<String>, String> {
    ws.with(|o| read_opt(&resolve(&o.root, &path)?).map_err(err))
}

/// Writes a file in the open folder. For data files, `base` is the text the edit was based on (None
/// for a new file): if the file on disk is something else, nothing is written and the error is
/// "changed-on-disk", so an outside change is never overwritten unseen. That holds even when the
/// watcher hasn't reported the change yet, or never will (network drives), and when a new file's
/// name matches an existing one on a case-insensitive disk.
#[tauri::command]
pub fn write_text(ws: State<Workspace>, path: String, text: String, base: Option<String>) -> Result<(), String> {
    ws.with(|o| {
        let full = resolve(&o.root, &path)?;
        if !is_data(&path) {
            return write_atomic(&full, &text).map_err(err);
        }
        let mut known = o.known.lock().unwrap();
        check_base(&full, base.as_deref(), Some(&text))?;
        write_atomic(&full, &text).map_err(err)?;
        known.insert(path, text);
        Ok(())
    })
}

fn check_base(full: &Path, base: Option<&str>, goal: Option<&str>) -> Result<(), String> {
    let disk = read_opt(full).map_err(err)?;
    if disk.as_deref() != base && disk.as_deref() != goal {
        return Err(CONFLICT.into());
    }
    Ok(())
}

/// Deletes a file in the open folder. For data files, `base` works as for write_text.
#[tauri::command]
pub fn remove_file(ws: State<Workspace>, path: String, base: Option<String>) -> Result<(), String> {
    ws.with(|o| {
        let full = resolve(&o.root, &path)?;
        let mut known = o.known.lock().unwrap();
        if is_data(&path) {
            check_base(&full, base.as_deref(), None)?;
        }
        match fs::remove_file(&full) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(err(e)),
        }
        known.remove(&path);
        Ok(())
    })
}

/// Saves a pasted transcript as `transcripts/<name>.md`, adding -2, -3… rather than replacing a
/// file that's already there. The window makes `name` from the date and a title. Returns the path.
#[tauri::command]
pub fn save_transcript(ws: State<Workspace>, name: String, text: String) -> Result<String, String> {
    if !is_transcript_name(&name) {
        return Err(format!("Not a transcript name: {name}"));
    }
    ws.with(|o| {
        fs::create_dir_all(resolve(&o.root, "transcripts")?).map_err(err)?;
        for n in 1..1000 {
            let rel = if n == 1 { format!("transcripts/{name}.md") } else { format!("transcripts/{name}-{n}.md") };
            match fs::OpenOptions::new().write(true).create_new(true).open(resolve(&o.root, &rel)?) {
                Ok(mut f) => {
                    f.write_all(text.as_bytes()).map_err(err)?;
                    return Ok(rel);
                }
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(err(e)),
            }
        }
        Err("There are too many transcripts with that name".into())
    })
}

fn is_transcript_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 100 && !name.starts_with('-') && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
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
            assert_eq!(scan(&root).files.keys().collect::<Vec<_>>(), ["cases/ok.md"]);
            // One unreadable file is skipped, not fatal.
            use std::os::unix::fs::PermissionsExt;
            fs::write(root.join("cases/locked.md"), "x").unwrap();
            fs::set_permissions(root.join("cases/locked.md"), fs::Permissions::from_mode(0o000)).unwrap();
            let found = scan(&root);
            assert_eq!(found.files.keys().collect::<Vec<_>>(), ["cases/ok.md"]);
            assert_eq!(found.skipped, ["cases/locked.md"]);
            fs::remove_file(root.join("cases/locked.md")).unwrap();
            // Writing keeps a file's permissions, and new files aren't owner-only.
            fs::set_permissions(root.join("cases/ok.md"), fs::Permissions::from_mode(0o664)).unwrap();
            write_atomic(&root.join("cases/ok.md"), "kept").unwrap();
            assert_eq!(fs::metadata(root.join("cases/ok.md")).unwrap().permissions().mode() & 0o777, 0o664);
            write_atomic(&root.join("cases/new.md"), "new").unwrap();
            assert_ne!(fs::metadata(root.join("cases/new.md")).unwrap().permissions().mode() & 0o044, 0);
            write_atomic(&root.join("cases/ok.md"), "new").unwrap();
            assert_eq!(fs::read_to_string(root.join("cases/ok.md")).unwrap(), "new");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn base_check() {
        let dir = std::env::temp_dir().join(format!("stepwise-base-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.md");
        assert!(check_base(&f, None, Some("x")).is_ok()); // new file
        fs::write(&f, "theirs").unwrap();
        assert_eq!(check_base(&f, None, Some("x")), Err(CONFLICT.into())); // name already taken
        assert_eq!(check_base(&f, Some("mine before"), Some("x")), Err(CONFLICT.into())); // changed on disk
        assert!(check_base(&f, Some("theirs"), Some("x")).is_ok());
        assert!(check_base(&f, Some("old"), Some("theirs")).is_ok()); // already says what we'd write
        assert_eq!(check_base(&f, Some("old"), None), Err(CONFLICT.into())); // delete after a change
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn allowed_folders() {
        let dir = std::env::temp_dir().join(format!("stepwise-allowed-{}", std::process::id()));
        fs::create_dir_all(dir.join("sub")).unwrap();
        let allowed = Allowed::default();
        allowed.allow(&display(&dir));
        assert!(allowed.check(&display(&dir)).is_ok());
        assert!(allowed.check(&format!("{}/sub/..", display(&dir))).is_ok()); // same folder
        assert!(allowed.check(&display(&dir.join("sub"))).is_err());
        assert!(allowed.check("/etc").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn transcript_names() {
        assert!(is_transcript_name("2026-10-17-expense-approval"));
        assert!(!is_transcript_name(""));
        assert!(!is_transcript_name("../cases/a"));
        assert!(!is_transcript_name("a.md"));
        assert!(!is_transcript_name("-a"));
        assert!(!is_transcript_name(&"a".repeat(101)));
    }

    #[test]
    fn subfolders_rewatched_only_when_replaced() {
        let root = std::env::temp_dir().join(format!("stepwise-watch-{}", std::process::id()));
        fs::create_dir_all(root.join("cases")).unwrap();
        let mut watched = Subfolders::new();
        let first = subfolder_updates(&root, &mut watched);
        assert_eq!(first, vec![(root.join("cases"), false, true)]); // blocks/ doesn't exist yet
        assert!(subfolder_updates(&root, &mut watched).is_empty()); // nothing changed: no re-watch
        fs::write(root.join("cases/a.md"), "x").unwrap();
        assert!(subfolder_updates(&root, &mut watched).is_empty()); // a file inside doesn't count
        fs::create_dir(root.join("blocks")).unwrap();
        assert_eq!(subfolder_updates(&root, &mut watched), vec![(root.join("blocks"), false, true)]);
        // Replaced, as by a git checkout: unwatch the old folder and watch the new one.
        fs::rename(root.join("cases"), root.join("old-cases")).unwrap();
        fs::create_dir(root.join("cases")).unwrap();
        assert_eq!(subfolder_updates(&root, &mut watched), vec![(root.join("cases"), true, true)]);
        fs::remove_dir_all(root.join("blocks")).unwrap();
        assert_eq!(subfolder_updates(&root, &mut watched), vec![(root.join("blocks"), true, false)]);
        fs::remove_dir_all(&root).unwrap();
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
