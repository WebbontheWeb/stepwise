/* Stepwise app: rendering, editing, folder storage. Format logic lives in core.js. */
(function () {
  'use strict';
  const S = window.Stepwise;
  const $ = sel => document.querySelector(sel);

  // ---------- small helpers ----------

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    block: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    x: '<path d="M7 7l10 10M17 7 7 17"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chevdown: '<path d="m7 10 5 5 5-5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', name === 'grip' ? 'icon fill' : 'icon');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }
  function logo() {
    const s = icon('x');
    s.setAttribute('class', 'logo');
    s.innerHTML = '<rect width="24" height="24" rx="6" fill="var(--accent)"/><path d="M5 17h4.5v-4.5H14V8h5" fill="none" stroke="var(--accent-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    return s;
  }
  const iconBtn = (name, label, onclick, cls = '') => h('button', { type: 'button', class: `icon-btn ${cls}`, title: label, 'aria-label': label, onclick }, icon(name));

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // The Rust side of the app (src-tauri) reads and writes files and keeps the folder list.
  const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const listen = (event, fn) => window.__TAURI__.event.listen(event, e => fn(e.payload));

  const firstLine = t => String(t || '').split('\n')[0];
  const clip = (t, n = 48) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const baseName = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
  const isMac = /Mac/i.test(navigator.platform);
  const MOD = isMac ? '⌘' : 'Ctrl+';
  const ALT = isMac ? '⌥' : 'Alt+';

  // ---------- state ----------

  const state = {
    project: S.createProject(),
    mode: 'demo',
    root: null,
    folders: [],
    current: null,
    sel: null,
    tab: LS.get('sw.tab', 'links'),
    expanded: new Set(),
    picked: new Set(),
    anchor: null,
    exportOpts: Object.assign({ blocks: 'inline', repeats: 'text', titleRow: 'own' }, LS.get('sw.export', {})),
    search: '',
    collapsed: new Set(LS.get('sw.collapsed', [])),
    dirty: new Set(),
    deleted: new Set(),
    saveTimer: null,
    saveState: 'saved',
    drag: null,
    copyPos: {},
    review: new Map(), // path -> { before, after }: changes made outside the app, not reviewed yet
    disk: {}, // path -> text, as Stepwise last read or wrote it
    away: new Map(), // folder -> its disk texts when you switched away from it
    conflicts: new Map(), // path -> your unsaved version, when the file changed on disk meanwhile
    copyFlash: null,
  };
  const P = () => state.project;

  function currentItem() {
    const s = state.sel;
    if (!s) return null;
    if (s.kind === 'case') return P().cases[s.id] || null;
    if (s.kind === 'block') return P().blocks[s.id] || null;
    return null;
  }

  function sortedCases() {
    return Object.values(P().cases).sort((a, b) => (a.suite || '~').localeCompare(b.suite || '~') || a.title.localeCompare(b.title));
  }
  function sortedBlocks() {
    return Object.values(P().blocks).sort((a, b) => a.title.localeCompare(b.title));
  }
  function lintOf(item) {
    return item.kind === 'case' ? S.lintCase(P(), item) : S.lintBlock(P(), item);
  }
  // Only http(s) URLs become links, so a shared stepwise.json can't smuggle in javascript: links.
  function safeBaseUrl(text) {
    try {
      const u = new URL(String(text || '').trim());
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.replace(/\/+$/, '') : null;
    } catch (e) {
      return null;
    }
  }
  function adoUrl(id) {
    const base = safeBaseUrl(P().settings.adoBaseUrl);
    return base ? `${base}/_workitems/edit/${encodeURIComponent(id)}` : null;
  }

  // ---------- files ----------

  function loadFiles(files) {
    const p = S.createProject();
    for (const [path, text] of Object.entries(files)) {
      const m = path.match(/^(cases|blocks)\/([^/]+)\.md$/);
      if (m && m[1] === 'cases') p.cases[m[2]] = S.parseCase(m[2], text);
      else if (m) p.blocks[m[2]] = S.parseBlock(m[2], text);
      else if (path === 'stepwise.json') { try { Object.assign(p.settings, JSON.parse(text)); } catch (e) { /* keep defaults */ } }
    }
    S.resolveReferences(p);
    return p;
  }
  const pathOf = item => `${item.kind === 'case' ? 'cases' : 'blocks'}/${item.id}.md`;
  const serialize = item => (item.kind === 'case' ? S.writeCase(item, S.blockTitleFn(P())) : S.writeBlock(item));
  const settingsText = () => JSON.stringify(P().settings, null, 2) + '\n';

  function allFiles() {
    const out = { 'stepwise.json': settingsText() };
    for (const c of Object.values(P().cases)) out[pathOf(c)] = serialize(c);
    for (const b of Object.values(P().blocks)) out[pathOf(b)] = serialize(b);
    return out;
  }

  function fileFor(key) {
    if (key === 'settings') return ['stepwise.json', settingsText()];
    const [kind, id] = key.split(':');
    const item = kind === 'case' ? P().cases[id] : P().blocks[id];
    return item ? [pathOf(item), serialize(item)] : [null, null];
  }

  // Paths are relative to the open folder; the Rust side refuses anything outside it.
  // state.disk holds each data file's text as Stepwise last read or wrote it. Saves send it along
  // as the version the edit was based on, so a file changed on disk in the meantime is never
  // overwritten unseen (the save is refused with "changed-on-disk" instead).
  const CONFLICT = 'changed-on-disk';
  const diskText = path => (path in state.disk ? state.disk[path] : null);
  const isDataPath = path => path === 'stepwise.json' || /^(cases|blocks)\/[^/]+\.md$/.test(path);
  async function writeFile(path, text, base = diskText(path)) {
    await invoke('write_text', { path, text, base });
    if (isDataPath(path)) state.disk[path] = text;
  }
  async function removeFile(path, base = diskText(path)) {
    await invoke('remove_file', { path, base });
    delete state.disk[path];
  }
  const readText = path => invoke('read_text', { path });
  const keyOf = path => {
    if (path === 'stepwise.json') return 'settings';
    const m = path.match(/^(cases|blocks)\/(.+)\.md$/);
    return m ? `${m[1] === 'cases' ? 'case' : 'block'}:${m[2]}` : null;
  };
  // Ids already in use, ignoring case: on Windows and macOS disks "Login.md" and "login.md" are one file.
  const usedIds = map => new Set(Object.keys(map).map(k => k.toLowerCase()));

  // ---------- saving ----------

  function touch(...items) {
    for (const item of items) state.dirty.add(item === 'settings' ? 'settings' : `${item.kind}:${item.id}`);
    setSave('pending');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flush, 450);
    scheduleLive();
  }

  async function flush() {
    clearTimeout(state.saveTimer);
    const keys = [...state.dirty];
    const deleted = [...state.deleted];
    state.dirty.clear();
    state.deleted.clear();
    if (!keys.length && !deleted.length) return;
    setSave('saving');
    let failed = false;
    if (state.mode === 'folder') {
      for (const key of keys) {
        const [path, text] = fileFor(key);
        if (!path) continue;
        if (state.conflicts.has(path)) { state.conflicts.set(path, text); continue; }
        try {
          await writeFile(path, text);
          if (state.review.delete(path)) { saveReview(); renderSide(); }
        } catch (err) {
          if (err === CONFLICT) { startConflict(path, text); continue; }
          state.dirty.add(key);
          failed = true;
          console.error(err);
        }
      }
      for (const path of deleted) {
        if (state.conflicts.has(path)) { state.conflicts.set(path, null); continue; }
        try {
          await removeFile(path);
        } catch (err) {
          if (err === CONFLICT) { startConflict(path, null); continue; }
          state.deleted.add(path);
          failed = true;
          console.error(err);
        }
      }
    } else {
      LS.set('sw.demo', allFiles());
    }
    // Edits that couldn't be saved stay unsaved and are tried again shortly.
    if (failed) state.saveTimer = setTimeout(flush, 5000);
    setSave(failed ? 'error' : state.conflicts.size ? 'conflict' : state.dirty.size ? 'pending' : 'saved');
    const count = Object.keys(P().cases).length;
    if (state.mode === 'folder' && state.current && state.current.cases !== count) { state.current.cases = count; saveFolders(); }
  }

  function setSave(s) {
    state.saveState = s;
    const el = $('#save');
    if (!el) return;
    el.className = 'save' + (s === 'error' || s === 'conflict' ? ' error' : '');
    el.textContent = {
      pending: 'Unsaved changes', saving: 'Saving…', saved: 'All changes saved',
      error: "Couldn't save. Trying again…", conflict: 'Changed on disk: choose a version',
    }[s];
    el.onclick = s === 'conflict' ? resolveConflicts : null;
    el.style.cursor = s === 'conflict' ? 'pointer' : '';
  }

  // ---------- conflicts ----------
  // A file changed on disk (by Claude, a teammate or a sync service) while you had unsaved edits
  // to it. Nothing is dropped: you choose which version to keep. state.conflicts maps the path to
  // your version (null if you deleted it).

  let resolving = null;
  function startConflict(path, mine) {
    state.conflicts.set(path, mine);
    setSave('conflict');
    resolveConflicts();
  }

  function resolveConflicts() {
    resolving = resolving || (async () => {
      try {
        while (state.conflicts.size) {
          while ($('#dialog').open) await sleep(300);
          const [path, mine] = state.conflicts.entries().next().value;
          if (!(await resolveConflict(path, mine))) break; // dismissed: ask again from the save status
        }
      } finally {
        resolving = null;
        setSave(state.conflicts.size ? 'conflict' : state.dirty.size ? 'pending' : 'saved');
      }
    })();
    return resolving;
  }

  async function resolveConflict(path, mine) {
    let disk;
    try {
      disk = await readText(path);
    } catch (e) {
      toast(`Couldn't read ${path}: ${e}`);
      return false;
    }
    if (disk === mine) {
      state.conflicts.delete(path);
      if (disk == null) delete state.disk[path]; else state.disk[path] = disk;
      return true;
    }
    const key = keyOf(path);
    const [kind, id] = (key || '').split(':');
    const item = kind === 'case' ? P().cases[id] : kind === 'block' ? P().blocks[id] : null;
    const name = (item && item.title) || path;
    const choice = await ask({
      title: `“${name}” was changed outside Stepwise`,
      body: disk == null
        ? `${path} was deleted on disk (by Claude, a teammate or a sync service) while you had unsaved edits to it.`
        : mine == null
          ? `You deleted ${path} here, but it was changed on disk (by Claude, a teammate or a sync service) before that was saved.`
          : `${path} changed on disk (by Claude, a teammate or a sync service) while you had unsaved edits to it. Which version do you want to keep?`,
      buttons: [
        { label: disk == null ? 'Leave it deleted' : mine == null ? 'Keep the file' : 'Use the version on disk', value: 'disk' },
        { label: mine == null ? 'Delete it' : 'Keep my version', value: 'mine', primary: true },
      ],
    });
    if (!choice) return false;
    if (choice === 'mine') {
      try {
        if (mine == null) await removeFile(path, disk);
        else await writeFile(path, mine, disk);
      } catch (e) {
        if (e === CONFLICT) return true; // changed yet again: the loop asks again with the newest version
        toast(`Couldn't save ${path}: ${e}`);
        return false;
      }
      if (state.review.delete(path)) saveReview();
      state.conflicts.delete(path);
      renderSide();
      return true;
    }
    // Take the version on disk.
    state.conflicts.delete(path);
    if (key) state.dirty.delete(key);
    if (disk == null) delete state.disk[path]; else state.disk[path] = disk;
    refreshAfterChanges([{ path, after: disk }]);
    return true;
  }

  // Before switching folders: save, and settle any conflicts. False if one is still open.
  async function settle() {
    await flush();
    if (state.conflicts.size) await resolveConflicts();
    if (!state.conflicts.size) return true;
    toast('Choose which version to keep first.');
    return false;
  }

  // ---------- opening folders ----------

  async function openFolder(path, opts = {}) {
    if (!path) {
      path = await invoke('pick_folder');
      if (!path) return;
    }
    const name = opts.entry ? folderLabel(opts.entry) : baseName(path);
    const failed = e => toast(`Couldn't open “${name}”: ${e}`, opts.entry && { label: 'Remove from list', run: () => forgetFolder(opts.entry) });
    let info;
    try {
      info = await invoke('folder_info', { path });
    } catch (e) {
      return failed(e);
    }
    // A folder counts as set up once it has stepwise.json or any cases or blocks, even if it's empty.
    // Folders from the list were set up before, so just add back whatever's missing.
    let choice = opts.entry ? 'empty' : null;
    if (!info.setUp && !choice) {
      choice = await ask({
        title: `Set up “${info.name}” for Stepwise?`,
        body: 'This adds cases/ and blocks/ folders, a stepwise.json settings file, and an AGENTS.md, CLAUDE.md and a few commands so Claude can work on the test cases with you. Nothing already in the folder is changed.',
        buttons: [{ label: 'Cancel' }, { label: 'Add sample cases too', value: 'sample' }, { label: 'Set up', value: 'empty', primary: true }],
      });
      if (!choice) return;
    }
    if (!(await settle())) return;
    let opened;
    try {
      opened = await invoke('open_workspace', { path: info.path, setup: !info.setUp });
    } catch (e) {
      return failed(e);
    }
    // Remember how the folder you're leaving looked, to show what changes there meanwhile.
    if (state.mode === 'folder' && state.root !== opened.path) state.away.set(state.root, state.disk);
    state.mode = 'folder';
    state.root = opened.path;
    state.disk = { ...opened.files };
    try {
      if (choice === 'sample' && !info.setUp) {
        for (const [p, text] of Object.entries(window.StepwiseSample)) {
          if (p === 'stepwise.json') continue;
          await writeFile(p, text);
          opened.files[p] = text;
        }
      }
    } catch (e) {
      console.error(e);
      toast(`Couldn't add the sample cases: ${e}`);
    }
    state.project = loadFiles(opened.files);
    state.picked.clear();
    state.review = await restoreReview(opened.path, opened.files);
    saveReview();
    LS.set('sw.mode', 'folder');
    await rememberFolder(opened.path);
    // Setting up a new folder (which says it adds these) counts as a yes.
    await offerClaudeFiles(state.current, !info.setUp && !opts.entry);
    // Come back to the case you were on in this folder.
    const last = state.current && state.current.sel;
    state.sel = last;
    if (!last || (last.kind !== 'coverage' && !currentItem())) selectFirst();
    renderAll();
    $('#main').scrollTop = 0;
    setSave('saved');
    state.watchWarned = false;
    const problems = [];
    if (opened.skipped.length) problems.push(`Couldn't read ${plural(opened.skipped.length, 'file')} (${clip(opened.skipped.join(', '), 80)}), so ${opened.skipped.length === 1 ? 'it isn’t' : 'they aren’t'} shown.`);
    if (opened.watch_error) problems.push(watchProblem(opened.watch_error));
    if (problems.length) toast(problems.join(' '), null, 12000);
    else if (!opts.quiet) toast(`Opened ${folderLabel(state.current)}`);
  }

  function watchProblem(error) {
    state.watchWarned = true;
    return `Stepwise can't watch this folder for changes made outside it (${error}). It still won't overwrite them: saving checks the file first.`;
  }

  // ---------- remembered folders ----------
  // Kept by the Rust side as JSON in Stepwise's own settings folder, never in a file inside a
  // repository or a test case folder.

  const folderLabel = f => (f ? f.label || baseName(f.path) : '');
  function folderSub(f) {
    const bits = [];
    if (f.label && f.label !== baseName(f.path)) bits.push(baseName(f.path));
    bits.push(plural(f.cases || 0, 'case'));
    if (f.ado) bits.push(f.ado);
    return bits.join(' · ');
  }
  function adoLabel(url) {
    const base = safeBaseUrl(url);
    if (!base) return '';
    const u = new URL(base);
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return u.hostname === 'dev.azure.com' ? parts.join(' / ') : [u.hostname, ...parts].join(' / ');
  }
  const saveFolders = () => invoke('save_folders', { folders: state.folders }).catch(e => console.error(e));

  async function rememberFolder(path) {
    let entry = state.folders.find(f => f.path === path);
    if (!entry) state.folders.push(entry = { path, label: '', sel: null });
    Object.assign(entry, { cases: Object.keys(P().cases).length, ado: adoLabel(P().settings.adoBaseUrl), opened: Date.now() });
    state.folders.sort((a, b) => b.opened - a.opened);
    state.folders = state.folders.slice(0, 15);
    state.current = entry;
    await saveFolders();
  }

  function forgetFolder(f) {
    state.folders = state.folders.filter(x => x !== f);
    if (state.current === f) state.current = null;
    saveFolders();
    renderTop();
    if (menuOpen()) renderSwitcher();
  }

  async function renameFolder(f) {
    setMenu(false);
    const r = await ask({
      title: 'Rename in this list',
      body: 'Only changes the name Stepwise shows. The folder on disk keeps its name.',
      input: { value: folderLabel(f) },
      buttons: [{ label: 'Cancel' }, { label: 'Rename', value: 'ok', primary: true }],
    });
    if (!r) return;
    const text = r.text.trim();
    f.label = text && text !== baseName(f.path) ? text : '';
    saveFolders();
    renderTop();
  }

  function switchTo(f) {
    setMenu(false);
    if (state.mode === 'folder' && f === state.current) return;
    openFolder(f.path, { entry: f });
  }

  async function switchToDemo() {
    setMenu(false);
    if (state.mode === 'demo') return;
    if (!(await settle())) return;
    await invoke('close_workspace');
    state.away.set(state.root, state.disk);
    Object.assign(state, { mode: 'demo', root: null, current: null, disk: {}, review: new Map() });
    state.picked.clear();
    state.project = loadFiles(LS.get('sw.demo', null) || window.StepwiseSample);
    LS.set('sw.mode', 'demo');
    selectFirst();
    renderAll();
    setSave('saved');
  }

  function renderSwitcher() {
    const menu = $('#switcher');
    const check = on => h('span', { class: 'mi-check' }, on ? icon('check') : null);
    const text = (name, sub) => h('span', { class: 'mi-text' }, h('span', { class: 'mi-name' }, name), sub ? h('span', { class: 'mi-sub' }, sub) : null);
    const rows = state.folders.map(f => {
      const current = state.mode === 'folder' && f === state.current;
      return h('div', { class: 'menu-row' },
        h('button', { class: 'menu-item', type: 'button', title: f.path, 'aria-current': current ? 'true' : null, onclick: () => switchTo(f) },
          check(current), text(folderLabel(f), folderSub(f))),
        iconBtn('pencil', `Rename ${folderLabel(f)}`, () => renameFolder(f)),
        iconBtn('x', `Remove ${folderLabel(f)} from this list`, () => forgetFolder(f)));
    });
    menu.replaceChildren(...[
      h('div', { class: 'menu-head' }, 'Your folders'),
      ...(rows.length ? rows : [h('p', { class: 'menu-note' }, 'Folders you open show up here, so you can switch between them.')]),
      h('div', { class: 'menu-sep' }),
      h('button', { class: 'menu-item', type: 'button', onclick() { setMenu(false); openFolder(); } },
        h('span', { class: 'mi-check' }, icon('plus')), text('Open another folder…')),
      h('button', { class: 'menu-item', type: 'button', 'aria-current': state.mode === 'demo' ? 'true' : null, onclick: switchToDemo },
        check(state.mode === 'demo'), text('Sample project', 'Demo data, kept inside Stepwise')),
      h('p', { class: 'menu-note foot' }, 'Stepwise keeps this list in its own settings, never in a file in your folders.'),
    ]);
  }

  // The folder menu is a popover. Older WebKit (Safari 16 and earlier, so macOS before Sonoma
  // without updates) has no popover API; there it's shown with a class instead.
  const hasPopover = typeof HTMLElement.prototype.showPopover === 'function';
  const menuOpen = () => (hasPopover ? $('#switcher').matches(':popover-open') : $('#switcher').classList.contains('open'));
  function setMenu(open) {
    const menu = $('#switcher');
    if (open === menuOpen()) return;
    if (hasPopover) return open ? menu.showPopover() : menu.hidePopover();
    if (open) renderSwitcher();
    menu.classList.toggle('open', open);
    if (open) {
      placeSwitcher();
      $('#switcher .menu-item[aria-current="true"], #switcher .menu-item')?.focus();
    }
  }

  function placeSwitcher() {
    const menu = $('#switcher');
    const btn = $('#top .proj');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
  }

  // AGENTS.md, CLAUDE.md and the commands let Claude (and other agents) work in the folder.
  // Stepwise adds them only with your OK, asked once per folder, and never puts back ones you
  // deleted. Only missing files are written.
  async function offerClaudeFiles(entry, agreed) {
    if (!entry || entry.claudeFiles != null) return;
    const missing = [];
    for (const path of Object.keys(window.StepwiseWorkspace.files)) if ((await readText(path).catch(() => null)) == null) missing.push(path);
    if (!missing.length) {
      entry.claudeFiles = true;
      return saveFolders();
    }
    if (!agreed) {
      const r = await ask({
        title: 'Help Claude work in this folder?',
        body: h('div', {},
          h('p', {}, 'Stepwise can add these files, which tell Claude Code how test cases are written here and add the /audit, /draft-case and /find-blocks commands:'),
          h('ul', { class: 'file-list' }, missing.map(p => h('li', {}, h('code', {}, p)))),
          h('p', { class: 'help' }, 'Nothing else in the folder changes. You can add them later in Settings.')),
        buttons: [{ label: 'Don’t add', value: 'no' }, { label: 'Add files', value: 'yes', primary: true }],
      });
      if (!r) return; // closed without answering: ask again next time
      agreed = r === 'yes';
    }
    entry.claudeFiles = agreed;
    saveFolders();
    if (agreed) await addClaudeFiles();
  }

  async function addClaudeFiles() {
    const W = window.StepwiseWorkspace;
    let added = 0;
    try {
      for (const [path, text] of Object.entries(W.files)) {
        const existing = await readText(path);
        if (existing == null || (path === 'CLAUDE.md' && W.isOldClaudeMd(existing))) { await writeFile(path, text); added++; }
      }
    } catch (e) {
      console.error(e);
      toast(`Couldn't add the files for Claude: ${e}`);
    }
    return added;
  }

  // ---------- changes made outside the app ----------
  // The Rust side watches cases/, blocks/ and stepwise.json and reports edits made by Claude, a
  // teammate or git (never the app's own writes), with each file's text before and after. Each
  // changed file waits in "Changes from Claude" until you keep or undo it.

  function applyChanges(changes) {
    for (const { path, after } of changes) {
      const key = keyOf(path);
      if (!key) continue;
      if (key === 'settings') {
        let settings = {};
        try { settings = JSON.parse(after || '{}'); } catch (e) { /* keep defaults */ }
        P().settings = Object.assign(S.createProject().settings, settings);
        continue;
      }
      const [kind, id] = key.split(':');
      const map = kind === 'case' ? P().cases : P().blocks;
      if (after == null) delete map[id];
      else map[id] = kind === 'case' ? S.parseCase(id, after) : S.parseBlock(id, after);
    }
    S.resolveReferences(P());
  }

  function onExternalChanges({ root, changes }) {
    if (state.mode !== 'folder' || root !== state.root) return;
    const applied = [];
    for (const change of changes) {
      const { path, before, after } = change;
      const key = keyOf(path);
      // Already being settled, or you have unsaved edits to it: ask which version to keep.
      if (state.conflicts.has(path)) continue;
      if ((key && state.dirty.has(key)) || state.deleted.has(path)) {
        const mine = state.deleted.has(path) ? null : fileFor(key)[1];
        if (key) state.dirty.delete(key);
        state.deleted.delete(path);
        startConflict(path, mine);
        continue;
      }
      if (after == null) delete state.disk[path]; else state.disk[path] = after;
      // Keep the text from before the first change you haven't reviewed, so Undo goes all the way back.
      const first = state.review.has(path) ? state.review.get(path).before : before;
      if (first === after) state.review.delete(path);
      else state.review.set(path, { before: first, after });
      applied.push(change);
    }
    if (!applied.length) return;
    saveReview();
    changes = applied;
    refreshAfterChanges(changes);
    toast(`${plural(changes.length, 'file')} changed outside Stepwise`, state.review.size ? { label: 'Review', run: () => select({ kind: 'review' }) } : null);
  }

  function refreshAfterChanges(changes) {
    const cur = state.sel && `${state.sel.kind}:${state.sel.id}`;
    applyChanges(changes);
    if (!state.sel || ((state.sel.kind === 'case' || state.sel.kind === 'block') && !currentItem())) selectFirst();
    renderTop();
    renderSide();
    // Leave the editor alone (and the caret where it is) unless what it shows has changed.
    if (state.sel?.kind === 'review' || changes.some(c => keyOf(c.path) === cur || c.path.startsWith('blocks/')) || !currentItem()) rerenderMain();
    renderPanel();
  }

  const pendingFor = item => state.review.has(pathOf(item));

  // Unreviewed changes are kept per folder (in Stepwise's settings, not the folder), so they
  // survive switching folders and quitting.
  function saveReview() {
    if (state.mode !== 'folder') return;
    invoke('save_review', { folder: state.root, entries: Object.fromEntries(state.review) }).catch(e => console.error(e));
  }

  async function restoreReview(root, files) {
    const review = new Map();
    const saved = await invoke('load_review', { folder: root }).catch(() => ({}));
    for (const [path, r] of Object.entries(saved)) {
      if (isDataPath(path) && r && typeof r === 'object') review.set(path, { before: r.before ?? null, after: r.after ?? null });
    }
    // Changes made while you were in another folder (Claude keeps working in its terminal there).
    const away = state.away.get(root);
    if (away) {
      for (const path of new Set([...Object.keys(away), ...Object.keys(files)])) {
        const was = path in away ? away[path] : null, now = path in files ? files[path] : null;
        if (was !== now && !review.has(path)) review.set(path, { before: was, after: now });
      }
      state.away.delete(root);
    }
    // Bring each change up to date with the file as it is now.
    for (const [path, r] of review) {
      r.after = path in files ? files[path] : null;
      if (r.after === r.before) review.delete(path);
    }
    return review;
  }

  function keepChange(path) {
    state.review.delete(path);
    saveReview();
    renderSide();
    rerenderMain();
  }

  // Puts the file back the way it was before the change: rewrites it, deletes a new file, or
  // restores a deleted one.
  async function undoChange(path) {
    const r = state.review.get(path);
    if (!r) return true;
    await flush();
    try {
      if (r.before == null) await removeFile(path);
      else await writeFile(path, r.before);
    } catch (e) {
      toast(e === 'changed-on-disk' ? `${path} changed again. Review the newest version first.` : `Couldn't undo ${path}: ${e}`);
      return false;
    }
    state.review.delete(path);
    saveReview();
    state.dirty.delete(keyOf(path));
    refreshAfterChanges([{ path, after: r.before }]);
    return true;
  }

  async function undoAll() {
    const paths = [...state.review.keys()];
    const r = await ask({
      title: `Undo ${plural(paths.length, 'change')}?`,
      body: 'Every file listed goes back to how it was before it was changed outside Stepwise. New files are deleted and deleted files come back.',
      buttons: [{ label: 'Cancel' }, { label: 'Undo all', value: 'ok', primary: true }],
    });
    if (!r) return;
    let undone = 0;
    for (const p of paths) if (await undoChange(p)) undone++;
    toast(`Undid ${plural(undone, 'change')}`);
  }

  function keepAll() {
    const n = state.review.size;
    state.review.clear();
    saveReview();
    renderSide();
    rerenderMain();
    toast(`Kept ${plural(n, 'change')}`);
  }

  function renderReview() {
    const entries = [...state.review.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      return h('div', { class: 'empty' },
        h('h1', {}, 'No changes to review'),
        h('p', {}, 'When Claude (or anyone else) changes files in this folder, they show up here so you can keep or undo each change.'));
    }
    return h('div', { class: 'doc review' },
      h('div', { class: 'rv-top' },
        h('div', {},
          h('h1', {}, 'Changes from Claude'),
          h('p', { class: 'help' }, `${plural(entries.length, 'file')} changed outside Stepwise since you last looked. Keep each change, or undo it to put the file back. Editing a file in Stepwise keeps its change.`)),
        h('div', { class: 'acts' },
          h('button', { class: 'btn', type: 'button', onclick: undoAll }, 'Undo all'),
          h('button', { class: 'btn primary', type: 'button', onclick: keepAll }, icon('check'), 'Keep all'))),
      entries.map(([path, r]) => renderFileChange(path, r)));
  }

  function renderFileChange(path, { before, after }) {
    const key = keyOf(path);
    const [kind, id] = (key || '').split(':');
    const item = kind === 'case' ? P().cases[id] : kind === 'block' ? P().blocks[id] : null;
    const status = before == null ? ['new', 'New'] : after == null ? ['gone', 'Deleted'] : ['changed', 'Changed'];
    const lines = S.diffLines(before, after);
    const added = lines.filter(l => l.type === 'add').length, removed = lines.filter(l => l.type === 'del').length;
    return h('section', { class: 'rv-file', 'data-path': path },
      h('div', { class: 'rv-head' },
        h('span', { class: `rv-status ${status[0]}` }, status[1]),
        h('span', { class: 'rv-name' },
          item ? h('button', { class: 'link', type: 'button', onclick: () => select({ kind, id }) }, item.title || id) : null,
          h('span', { class: 'path' }, path)),
        h('span', { class: 'rv-count' }, h('span', { class: 'add' }, `+${added}`), ' ', h('span', { class: 'del' }, `−${removed}`)),
        h('div', { class: 'acts' },
          h('button', { class: 'btn small', type: 'button', onclick: () => undoChange(path) }, 'Undo'),
          h('button', { class: 'btn small primary', type: 'button', onclick: () => keepChange(path) }, icon('check'), 'Keep'))),
      renderDiff(lines));
  }

  // Changed lines with three lines of context; longer unchanged stretches fold into one row.
  function renderDiff(lines) {
    const near = lines.map(() => false);
    lines.forEach((l, i) => { if (l.type !== 'same') for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) near[j] = true; });
    const rows = [];
    for (let i = 0; i < lines.length;) {
      if (!near[i]) {
        let j = i;
        while (j < lines.length && !near[j]) j++;
        rows.push(h('div', { class: 'dl skip' }, h('span', { class: 'mk' }), `${plural(j - i, 'unchanged line')}`));
        i = j;
        continue;
      }
      const l = lines[i++];
      rows.push(h('div', { class: `dl ${l.type}` }, h('span', { class: 'mk', 'aria-label': l.type === 'add' ? 'Added' : l.type === 'del' ? 'Removed' : null }, l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''), l.text || ' '));
    }
    return h('div', { class: 'diff' }, rows);
  }

  // ---------- selection ----------

  function select(sel) {
    state.sel = sel;
    state.picked.clear();
    state.anchor = null;
    state.copyFlash = null;
    setDrawer('side', false);
    LS.set('sw.sel', sel);
    if (state.mode === 'folder' && state.current) { state.current.sel = sel; saveFolders(); }
    renderSide();
    renderMain();
    renderPanel();
    $('#main').scrollTop = 0;
  }
  // In narrow windows the sidebar and the details panel become slide-out drawers.
  function setDrawer(which, open) {
    const app = $('.app');
    if (open) app.classList.remove(which === 'side' ? 'panel-open' : 'side-open');
    app.classList.toggle(`${which}-open`, open);
  }
  function toggleDrawer(which) {
    setDrawer(which, !$('.app').classList.contains(`${which}-open`));
  }

  function selectFirst() {
    const c = sortedCases()[0];
    state.sel = c ? { kind: 'case', id: c.id } : null;
  }

  // ---------- rendering: top bar ----------

  function renderAll() {
    renderTop();
    renderSide();
    renderMain();
    renderPanel();
  }

  function renderTop() {
    const proj = h('button', {
      class: 'proj', type: 'button', popovertarget: 'switcher', title: `Switch folder (${MOD}O)`,
      onclick: hasPopover ? null : () => setMenu(!menuOpen()),
    },
      icon('folder'),
      h('span', { class: 'name' }, state.mode === 'folder' ? folderLabel(state.current) || baseName(state.root) : 'Sample project'),
      state.mode === 'demo' ? h('span', { class: 'pill demo', title: 'Changes are kept inside Stepwise only. Open a folder to save real files.' }, 'Demo') : null,
      icon('chevdown'));
    $('#top').replaceChildren(...[
      h('button', { class: 'icon-btn only-narrow', type: 'button', title: 'Test cases', 'aria-label': 'Show test cases', onclick: () => toggleDrawer('side') }, icon('menu')),
      h('div', { class: 'brand' }, logo(), 'Stepwise'),
      proj,
      h('span', { class: 'save', id: 'save' }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', title: 'Export CSV', onclick: exportDialog }, icon('download'), h('span', { class: 't-label' }, 'Export CSV')),
      h('button', { class: 'btn ghost only-tiny', type: 'button', title: 'Links, checks and export', onclick: () => toggleDrawer('panel') }, icon('panel'), h('span', { class: 't-label' }, 'Details')),
      iconBtn('gear', 'Settings', settingsDialog),
      state.mode === 'demo' ? h('button', { class: 'btn primary', type: 'button', title: 'Choose a folder to keep test cases in', onclick: () => openFolder() },
        icon('folder'), h('span', { class: 't-label' }, 'Open folder')) : null,
    ].filter(Boolean));
    setSave(state.saveState);
  }

  // ---------- rendering: sidebar ----------

  function matches(item, q) {
    if (!q) return true;
    const hay = [item.title, item.id, item.suite, ...(item.tags || []), ...(item.tests || []),
      ...item.steps.map(s => `${s.action || ''} ${s.expected || ''} ${s.note || ''}`)].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function renderSide() {
    const q = state.search.trim().toLowerCase();
    const cur = state.sel || {};
    const kids = [];

    kids.push(h('div', { class: 'sec' }, 'Views'));
    if (state.review.size || cur.kind === 'review') kids.push(h('button', {
      class: 'item flat nav', type: 'button', 'aria-current': cur.kind === 'review' ? 'true' : null,
      onclick: () => select({ kind: 'review' }),
    }, icon('sparkle'), h('span', { class: 't' }, 'Changes from Claude'), state.review.size ? h('span', { class: 'pill new' }, state.review.size) : null));
    kids.push(h('button', {
      class: 'item flat nav', type: 'button', 'aria-current': cur.kind === 'coverage' ? 'true' : null,
      onclick: () => select({ kind: 'coverage' }),
    }, icon('target'), h('span', { class: 't' }, 'Requirements coverage')));

    const cases = sortedCases().filter(c => matches(c, q));
    kids.push(h('div', { class: 'sec' }, `Test cases · ${Object.keys(P().cases).length}`, iconBtn('plus', 'New test case', newCaseDialog)));
    const groups = new Map();
    for (const c of cases) {
      const g = c.suite || 'No suite';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    for (const [name, list] of groups) {
      const open = q || !state.collapsed.has(name);
      kids.push(h('button', {
        class: 'group-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
        onclick() {
          state.collapsed.has(name) ? state.collapsed.delete(name) : state.collapsed.add(name);
          LS.set('sw.collapsed', [...state.collapsed]);
          renderSide();
        },
      }, icon('chevron'), name, h('span', { class: 'c' }, list.length)));
      if (open) for (const c of list) {
        kids.push(h('button', {
          class: 'item', type: 'button', 'aria-current': cur.kind === 'case' && cur.id === c.id ? 'true' : null,
          onclick: () => select({ kind: 'case', id: c.id }),
        }, h('span', { class: `dot ${S.worstLevel(lintOf(c))}`, title: lintTitle(lintOf(c)) }),
          h('span', { class: 't' }, c.title || 'Untitled test case'),
          pendingFor(c) ? updatedPill(c) : null,
          c.ado_id ? h('span', { class: 'm' }, `#${c.ado_id}`) : null));
      }
    }
    if (!cases.length) kids.push(h('div', { class: 'empty-side' }, q ? 'No matching test cases.' : 'No test cases yet.'));

    const blocks = sortedBlocks().filter(b => matches(b, q));
    kids.push(h('div', { class: 'sec' }, `Step blocks · ${Object.keys(P().blocks).length}`, iconBtn('plus', 'New step block', newBlockDialog)));
    for (const b of blocks) {
      const uses = S.blockUsage(P(), b.id).length;
      kids.push(h('button', {
        class: 'item flat', type: 'button', 'aria-current': cur.kind === 'block' && cur.id === b.id ? 'true' : null,
        onclick: () => select({ kind: 'block', id: b.id }),
      }, icon('block'), h('span', { class: 't' }, b.title || 'Untitled block'),
        pendingFor(b) ? updatedPill(b) : null,
        h('span', { class: 'm', title: `Used by ${plural(uses, 'test case')}` }, `${uses}×`)));
    }
    if (!blocks.length) kids.push(h('div', { class: 'empty-side' }, q ? 'No matching blocks.' : 'Select steps in a test case and choose “Make reusable block”.'));

    $('#side').replaceChildren(...kids);
  }

  // The "updated" marker on a changed case or block leads to its change in the review.
  function updatedPill(item) {
    return h('span', {
      class: 'pill new', role: 'link', tabindex: '0', title: 'Changed outside Stepwise. Review the change',
      onclick(e) { e.stopPropagation(); reviewFile(pathOf(item)); },
      onkeydown(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); reviewFile(pathOf(item)); } },
    }, 'updated');
  }

  function reviewFile(path) {
    select({ kind: 'review' });
    const el = document.querySelector(`#main .rv-file[data-path="${CSS.escape(path)}"]`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); }
  }

  function lintTitle(issues) {
    const e = issues.filter(i => i.level === 'error').length, w = issues.filter(i => i.level === 'warn').length;
    if (!e && !w) return 'No problems found';
    return [e && plural(e, 'error'), w && plural(w, 'warning')].filter(Boolean).join(', ');
  }

  // Cheap refresh while typing: sidebar, panel and a few live labels in the editor.
  let liveTimer = null;
  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      renderSide();
      renderPanel();
      updateLiveLabels();
    }, 160);
  }

  function updateLiveLabels() {
    const item = currentItem();
    if (!item) return;
    const count = $('#export-count');
    if (count && item.kind === 'case') count.textContent = stepCountText(item);
    const issues = lintOf(item);
    document.querySelectorAll('#main .step').forEach(row => {
      const level = S.worstLevel(issues.filter(i => i.step === row.dataset.id));
      const dot = row.querySelector('.gutter .dot');
      if (dot) dot.className = `dot ${level === 'ok' || level === 'info' ? '' : level}`;
    });
  }

  // ---------- rendering: main ----------

  function rerenderMain() {
    const a = document.activeElement;
    const key = a && a.dataset ? a.dataset.key : null;
    const start = a && a.selectionStart, end = a && a.selectionEnd;
    const scroll = $('#main').scrollTop;
    renderMain();
    $('#main').scrollTop = scroll;
    if (key) {
      const el = document.querySelector(`#main [data-key="${CSS.escape(key)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (el.isContentEditable) {
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(false);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
        } else {
          try { if (start != null) el.setSelectionRange(start, end); } catch (e) { /* not a text field */ }
        }
      }
    }
  }

  function renderMain() {
    const sel = state.sel;
    const main = $('#main');
    if (sel && sel.kind === 'coverage') return main.replaceChildren(renderCoverage());
    if (sel && sel.kind === 'review') return main.replaceChildren(renderReview());
    const item = currentItem();
    if (!item) {
      const none = !Object.keys(P().cases).length;
      return main.replaceChildren(h('div', { class: 'empty' },
        h('h1', {}, none ? 'No test cases yet' : 'No test case selected'),
        h('p', {}, none
          ? 'Write your first one.'
          : 'Pick one from the list, or start a new one.'),
        h('button', { class: 'btn primary', type: 'button', onclick: newCaseDialog }, icon('plus'), 'New test case')));
    }
    main.replaceChildren(item.kind === 'case' ? renderCase(item) : renderBlock(item));
  }

  function field(label, control, cls) {
    return h('label', { class: cls }, h('span', { class: 'lbl' }, label), control);
  }
  function input(item, key, props = {}) {
    return h('input', {
      class: 'field', value: item[key] || '', 'data-key': key, ...props,
      oninput(e) { item[key] = e.target.value; touch(item); },
    });
  }
  function textArea(item, key, placeholder, label) {
    return richField({ value: item[key], placeholder, label, key, cls: 'field', onChange(v) { item[key] = v; touch(item); } });
  }

  // A formatted-text field: ⌘B bold, ⌘I italic, stored as Markdown (**bold**, *italic*).
  function richField({ value, onChange, placeholder, key, label, cls, onKeydown }) {
    const el = h('div', {
      class: `rich ${cls}`, contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
      'aria-label': label || placeholder, 'data-placeholder': placeholder, 'data-key': key,
    });
    el.innerHTML = S.inlineToHtml(value);
    el.addEventListener('input', () => {
      if (!el.textContent) el.innerHTML = ''; // lets the placeholder show again
      onChange(domToInline(el));
    });
    el.addEventListener('keydown', e => {
      if (onKeydown) onKeydown(e);
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'i')) {
        e.preventDefault();
        document.execCommand(e.key === 'b' ? 'bold' : 'italic');
      } else if (mod && e.key === 'u') {
        e.preventDefault(); // underline isn't kept in the files, so don't offer it
      } else if (e.key === 'Enter' && !mod) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    el.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    el.addEventListener('drop', e => e.preventDefault());
    return el;
  }

  // Turn the field's DOM back into Markdown: bold/italic runs, line breaks, literal * escaped.
  function domToInline(root) {
    const segs = [];
    const walk = (node, b, i) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) { segs.push({ t: n.nodeValue.replace(/\u00a0/g, ' '), b, i }); continue; }
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        if (n.tagName === 'BR') { segs.push({ t: '\n', b: false, i: false }); continue; }
        if (/^(DIV|P|LI)$/.test(n.tagName) && segs.length && !segs[segs.length - 1].t.endsWith('\n')) segs.push({ t: '\n', b: false, i: false });
        const fw = n.style.fontWeight, fs = n.style.fontStyle;
        const nb = /^(B|STRONG)$/.test(n.tagName) || (fw ? fw === 'bold' || +fw >= 600 : b);
        const ni = /^(I|EM)$/.test(n.tagName) || (fs ? fs === 'italic' : i);
        walk(n, nb, ni);
      }
    };
    walk(root, false, false);
    const wrap = (text, b, i) => {
      text = text.replace(/\*/g, '\\*');
      const m = text.match(/^(\s*)(.*?)(\s*)$/);
      const mark = b && i ? '***' : b ? '**' : i ? '*' : '';
      return m[2] && mark ? m[1] + mark + m[2] + mark + m[3] : text;
    };
    let out = '', cur = null;
    const flush = () => { if (cur) out += cur.t.split('\n').map(part => wrap(part, cur.b, cur.i)).join('\n'); cur = null; };
    for (const s of segs) {
      if (cur && cur.b === s.b && cur.i === s.i) cur.t += s.t;
      else { flush(); cur = { ...s }; }
    }
    flush();
    return out.replace(/\n+$/, '');
  }
  function selectEl(item, key, options) {
    return h('select', {
      class: 'field', 'data-key': key,
      onchange(e) { item[key] = e.target.value; touch(item); },
    }, options.map(([v, label]) => h('option', { value: v, selected: String(item[key]) === v }, label)));
  }

  function renderCase(c) {
    const suites = [...new Set(Object.values(P().cases).map(o => o.suite).filter(Boolean))].sort();
    const url = c.ado_id && adoUrl(c.ado_id);
    return h('div', { class: 'doc' },
      h('div', { class: 'doc-head' },
        h('span', { class: 'path', title: 'File name in your folder' }, `cases/${c.id}.md`),
        c.ado_id
          ? (url ? h('a', { class: 'tag ado', href: url, target: '_blank', rel: 'noopener' }, `ADO #${c.ado_id}`) : h('span', { class: 'tag ado' }, `ADO #${c.ado_id}`))
          : h('span', { class: 'tag' }, 'Not in ADO yet'),
        h('div', { class: 'acts' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => duplicateCase(c) }, icon('copy'), 'Duplicate'),
          h('button', { class: 'btn ghost small danger', type: 'button', onclick: () => deleteCase(c) }, icon('trash'), 'Delete'))),
      h('input', {
        class: 'title-input', value: c.title, placeholder: 'Test case title', 'data-key': 'title', 'aria-label': 'Title',
        oninput(e) { c.title = e.target.value; touch(c); },
      }),
      h('div', { class: 'meta' },
        field('Suite', h('span', {}, input(c, 'suite', { list: 'suite-list', placeholder: 'e.g. Expenses / Approvals' }),
          h('datalist', { id: 'suite-list' }, suites.map(s => h('option', { value: s })))), 'wide'),
        field('State', selectEl(c, 'state', S.STATES.map(s => [s, s]))),
        field('Priority', selectEl(c, 'priority', [['1', '1 · Highest'], ['2', '2'], ['3', '3'], ['4', '4 · Lowest']])),
        field('Area path', input(c, 'area', { placeholder: 'Project\\Area' }), 'wide'),
        field('Assigned to', input(c, 'assigned', { placeholder: 'Name or email' })),
        field('ADO ID', input(c, 'ado_id', { inputmode: 'numeric', placeholder: 'Not in ADO yet' })),
        field('Tags', h('input', {
          class: 'field', value: c.tags.join(', '), placeholder: 'comma, separated', 'data-key': 'tags',
          oninput(e) { c.tags = e.target.value.split(/[,;]/).map(t => t.trim()).filter(Boolean); touch(c); },
        }), 'wide')),
      h('div', { class: 'text-fields' },
        field('Description', textArea(c, 'description', 'What this case checks and why', 'Description')),
        field('Preconditions', textArea(c, 'preconditions', 'Accounts, data and settings the steps assume', 'Preconditions'))),
      renderSteps(c));
  }

  function renderBlock(b) {
    const users = S.blockUsage(P(), b.id);
    return h('div', { class: 'doc' },
      h('div', { class: 'doc-head' },
        h('span', { class: 'path' }, `blocks/${b.id}.md`),
        h('span', { class: 'tag' }, `Used by ${plural(users.length, 'test case')}`),
        h('div', { class: 'acts' },
          h('button', {
            class: 'btn ghost small danger', type: 'button', disabled: users.length > 0,
            title: users.length ? 'Remove this block from every test case before deleting it' : null,
            onclick: () => deleteBlock(b),
          }, icon('trash'), 'Delete'))),
      h('input', {
        class: 'title-input', value: b.title, placeholder: 'Block name', 'data-key': 'title', 'aria-label': 'Block name',
        oninput(e) { b.title = e.target.value; touch(b, ...S.blockUsage(P(), b.id)); },
      }),
      h('p', { class: 'help', style: 'margin-top:6px' }, 'Edits here show up in every test case that uses this block.'),
      h('div', { class: 'text-fields', style: 'grid-template-columns:1fr' },
        field('Description', textArea(b, 'description', 'When to use this block', 'Description'))),
      renderSteps(b));
  }

  function stepCountText(c) {
    const n = S.flatten(P(), c, state.exportOpts).length;
    return n === c.steps.length ? plural(n, 'step') : `${plural(c.steps.length, 'step')} here · ${n} in ADO`;
  }

  function optionLabel(item, i) {
    const s = item.steps[i];
    let t;
    if (s.type === 'use') t = `Block: ${P().blocks[s.block]?.title || s.block || '?'}`;
    else if (s.type === 'repeat') t = S.rangeLabel(item.steps, s.from, s.to);
    else t = firstLine(s.action) || '(empty step)';
    return `${i + 1}. ${clip(t, 30)}`;
  }

  function renderSteps(item) {
    const isCase = item.kind === 'case';
    const issues = lintOf(item);
    const rows = item.steps.map((s, i) => renderStep(item, s, i, issues.filter(x => x.step === s.id)));
    const addBtns = h('div', { class: 'addbar' },
      h('button', { class: 'btn', type: 'button', onclick: () => insertStep(item, item.steps.length, 'action') }, icon('plus'), 'Step'),
      isCase && h('button', {
        class: 'btn block', type: 'button', onclick: () => insertStep(item, item.steps.length, 'use'),
        title: 'Insert all the steps of a reusable block',
      }, icon('block'), 'Use block'),
      isCase && h('button', {
        class: 'btn repeat', type: 'button', disabled: !item.steps.length, onclick: () => insertRepeat(item),
        title: 'Repeat earlier steps; the step numbers stay correct as you edit',
      }, icon('repeat'), 'Repeat steps'));

    return h('section', { 'aria-label': 'Steps' },
      h('div', { class: 'steps-head' },
        h('h2', {}, 'Steps'),
        isCase ? h('span', { class: 'count', id: 'export-count' }, stepCountText(item)) : h('span', { class: 'count' }, plural(item.steps.length, 'step'))),
      h('div', { class: 'colhead' }, h('span', {}, '#'), h('span', {}, 'Action'), h('span', {}, 'Expected result'), h('span', {})),
      rows.length ? rows : h('div', { class: 'empty-steps' }, 'No steps yet.'),
      addBtns,
      h('p', { class: 'shortcuts' },
        h('span', {}, h('kbd', {}, `${MOD}↵`), ' new step'), h('span', {}, h('kbd', {}, `${MOD}B`), ' bold'), h('span', {}, h('kbd', {}, `${MOD}I`), ' italic'),
        h('span', {}, h('kbd', {}, `${ALT}↑↓`), ' move'), h('span', {}, 'Click a step number to select steps')),
      state.picked.size ? renderSelBar(item) : null);
  }

  function renderStep(item, s, i, issues) {
    const picked = state.picked.has(s.id);
    const level = S.worstLevel(issues);
    const row = h('div', { class: `step ${s.type}${picked ? ' picked' : ''}`, 'data-id': s.id });

    const gutter = h('div', { class: 'gutter' },
      h('span', { class: `dot ${level === 'ok' || level === 'info' ? '' : level}`, title: issues.map(x => x.msg).join('\n') || null }),
      h('button', {
        class: 'num', type: 'button', 'aria-pressed': picked ? 'true' : 'false',
        title: 'Select this step (Shift-click to select a range)',
        onclick: e => pickStep(item, s, e),
      }, i + 1),
      h('span', {
        class: 'grip', draggable: 'true', title: 'Drag to reorder',
        ondragstart(e) { state.drag = { item, id: s.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); row.classList.add('dragging'); },
        ondragend() { state.drag = null; row.classList.remove('dragging'); document.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after')); },
      }, icon('grip')));

    const tools = h('div', { class: 'tools' },
      iconBtn('plus', 'Insert a step below', () => insertStep(item, i + 1, 'action')),
      iconBtn('copy', 'Duplicate step', () => duplicateStep(item, i)),
      iconBtn('trash', 'Delete step', () => deleteSteps(item, [s.id]), 'danger'));

    let left, right, sub = null;
    if (s.type === 'use') {
      const b = P().blocks[s.block];
      const open = state.expanded.has(s.id);
      left = h('div', { class: 'ref' },
        h('span', { class: 'badge block' }, icon('block'), 'Block'),
        h('select', {
          class: 'mini', 'data-key': `${s.id}:block`, 'aria-label': `Step ${i + 1} block`,
          onchange(e) { s.block = e.target.value; touch(item); rerenderMain(); },
        }, h('option', { value: '', selected: !s.block }, 'Choose a block…'),
          sortedBlocks().map(o => h('option', { value: o.id, selected: o.id === s.block }, o.title)),
          s.block && !b ? h('option', { value: s.block, selected: true }, `Missing: ${s.block}`) : null),
        b && h('button', {
          class: 'expand', type: 'button', 'aria-expanded': open ? 'true' : 'false',
          onclick() { toggleExpand(s.id); },
        }, icon('chevron'), plural(b.steps.length, 'step')),
        b && h('button', { class: 'link', type: 'button', style: 'font-size:12.5px', onclick: () => select({ kind: 'block', id: b.id }) }, 'Edit block'));
      if (b) left.classList.add('span2');
      right = b ? null : h('div', { class: 'ref-note' }, 'Choose which block’s steps go here.');
      if (b && open) sub = h('div', { class: 'sub' }, b.steps.length
        ? b.steps.map((bs, j) => subRow(`${i + 1}.${j + 1}`, bs.action, bs.expected))
        : h('div', { class: 'subrow' }, h('span', {}), h('span', { class: 'none' }, 'This block has no steps yet.')));
    } else if (s.type === 'repeat') {
      const earlier = item.steps.slice(0, i);
      const open = state.expanded.has(s.id);
      const opts = (val, placeholder) => [
        h('option', { value: '', selected: !val }, placeholder),
        earlier.map((o, j) => h('option', { value: o.id, selected: o.id === val, title: optionLabel(item, j) }, String(j + 1))),
      ];
      left = h('div', { class: 'ref' },
        h('span', { class: 'badge repeat' }, icon('repeat'), 'Repeat'),
        h('span', { class: 'word' }, 'steps'),
        h('select', {
          class: 'mini', 'data-key': `${s.id}:from`, 'aria-label': `Step ${i + 1} repeat from`,
          onchange(e) {
            s.from = e.target.value;
            const a = item.steps.findIndex(o => o.id === s.from), b = item.steps.findIndex(o => o.id === s.to);
            if (!s.to || b < a) s.to = s.from;
            touch(item); rerenderMain();
          },
        }, opts(s.from, '–')),
        h('span', { class: 'word' }, 'to'),
        h('select', {
          class: 'mini', 'data-key': `${s.id}:to`, 'aria-label': `Step ${i + 1} repeat through`,
          onchange(e) { s.to = e.target.value; touch(item); rerenderMain(); },
        }, opts(s.to, '–')),
        s.from && s.to && h('button', {
          class: 'expand', type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick() { toggleExpand(s.id); },
        }, icon('chevron'), open ? 'Hide steps' : 'Show steps'),
        h('input', {
          class: 'mini note', value: s.note, placeholder: 'Note, e.g. as a manager', 'data-key': `${s.id}:note`, 'aria-label': `Step ${i + 1} note`,
          oninput(e) { s.note = e.target.value; touch(item); },
        }));
      right = stepArea(item, s, i, 'expected', 'Expected result (leave blank for “same results”)');
      if (open) {
        const a = item.steps.findIndex(o => o.id === s.from), z = item.steps.findIndex(o => o.id === s.to);
        if (a >= 0 && z >= a && z < i) sub = h('div', { class: 'sub' }, expandRange(item, a, z));
      }
    } else {
      left = stepArea(item, s, i, 'action', 'Action');
      right = stepArea(item, s, i, 'expected', 'Expected result');
    }

    row.append(...[gutter, left, right, tools].filter(Boolean));
    if (sub) row.append(sub);

    row.addEventListener('dragover', e => {
      if (!state.drag || state.drag.item !== item) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      row.classList.toggle('drop-after', after);
      row.classList.toggle('drop-before', !after);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
    row.addEventListener('drop', e => {
      if (!state.drag || state.drag.item !== item) return;
      e.preventDefault();
      const after = row.classList.contains('drop-after');
      row.classList.remove('drop-before', 'drop-after');
      moveStep(item, state.drag.id, i + (after ? 1 : 0));
    });
    return row;
  }

  // Formatted, read-only text (inlineToHtml escapes everything, then adds <strong>/<em>/<br>).
  function richText(md, tag = 'span', props = {}) {
    const el = h(tag, props);
    el.innerHTML = S.inlineToHtml(md);
    return el;
  }

  function subRow(n, action, expected) {
    return h('div', { class: 'subrow' },
      h('span', { class: 'n' }, n),
      action ? richText(action) : h('span', { class: 'none' }, 'No action'),
      expected ? richText(expected) : h('span', { class: 'none' }, '—'));
  }

  function expandRange(item, a, z) {
    const out = [];
    for (let j = a; j <= z; j++) {
      const s = item.steps[j];
      if (s.type === 'action') out.push(subRow(String(j + 1), s.action, s.expected));
      else if (s.type === 'use') {
        const b = P().blocks[s.block];
        if (!b) out.push(subRow(String(j + 1), `Missing block: ${s.block}`, ''));
        else b.steps.forEach((bs, k) => out.push(subRow(`${j + 1}.${k + 1}`, bs.action, bs.expected)));
      } else out.push(subRow(String(j + 1), `${S.rangeLabel(item.steps, s.from, s.to)} ${s.note || ''}`, s.expected));
    }
    return out;
  }

  function stepArea(item, s, i, key, placeholder) {
    return richField({
      value: s[key], placeholder, cls: 'cell', key: `${s.id}:${key}`,
      label: `Step ${i + 1} ${key === 'action' ? 'action' : 'expected result'}`,
      onChange(v) { s[key] = v; touch(item); },
      onKeydown(e) { stepKeys(e, item, s); },
    });
  }

  function renderSelBar(item) {
    const picked = item.steps.filter(s => state.picked.has(s.id));
    const isCase = item.kind === 'case';
    const allActions = picked.every(s => s.type === 'action');
    return h('div', { class: 'selbar', role: 'toolbar', 'aria-label': 'Selected steps' },
      h('span', {}, `${plural(picked.length, 'step')} selected`),
      isCase && h('button', {
        class: 'btn small', type: 'button', disabled: !allActions, onclick: () => makeBlock(item),
        title: allActions ? 'Move these steps into a reusable block' : 'Only plain steps can go into a block',
      }, icon('block'), 'Make reusable block'),
      isCase && h('button', { class: 'btn small', type: 'button', onclick: () => repeatPicked(item) }, icon('repeat'), 'Repeat at end'),
      h('button', { class: 'btn small', type: 'button', onclick: () => deleteSteps(item, picked.map(s => s.id)) }, icon('trash'), 'Delete'),
      iconBtn('x', 'Clear selection', () => { state.picked.clear(); rerenderMain(); }));
  }

  function toggleExpand(id) {
    state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
    rerenderMain();
  }

  // ---------- step operations ----------

  const takenIds = item => new Set(item.steps.map(s => s.id));
  const snapshot = item => JSON.parse(JSON.stringify(item.steps));

  function focusStep(id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`#main [data-key="${id}:action"], #main .step[data-id="${id}"] select`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
    });
  }

  function insertStep(item, index, type, extra) {
    const s = S.newStep(type, takenIds(item), extra);
    item.steps.splice(index, 0, s);
    touch(item);
    rerenderMain();
    focusStep(s.id);
    return s;
  }

  function insertRepeat(item) {
    // Default to repeating the last two plain steps, which is the common case.
    const n = item.steps.length;
    const from = item.steps[Math.max(0, n - 2)].id, to = item.steps[n - 1].id;
    const s = insertStep(item, n, 'repeat', { from, to });
    state.expanded.add(s.id);
    rerenderMain();
  }

  function duplicateStep(item, i) {
    const copy = { ...item.steps[i], id: S.stepId(takenIds(item)) };
    item.steps.splice(i + 1, 0, copy);
    touch(item);
    rerenderMain();
    focusStep(copy.id);
  }

  function deleteSteps(item, ids) {
    const before = snapshot(item);
    const idx = id => item.steps.findIndex(s => s.id === id);
    // Shrink repeat ranges so they keep pointing at the steps that remain.
    for (const r of item.steps) {
      if (r.type !== 'repeat' || ids.includes(r.id)) continue;
      let a = idx(r.from), b = idx(r.to);
      if (a < 0 || b < 0) continue;
      while (a <= b && ids.includes(item.steps[a].id)) a++;
      while (b >= a && ids.includes(item.steps[b].id)) b--;
      if (a <= b) { r.from = item.steps[a].id; r.to = item.steps[b].id; }
    }
    item.steps = item.steps.filter(s => !ids.includes(s.id));
    ids.forEach(id => state.picked.delete(id));
    touch(item);
    rerenderMain();
    toast(`Deleted ${plural(ids.length, 'step')}`, { label: 'Undo', run() { item.steps = before; touch(item); rerenderMain(); } });
  }

  function moveStep(item, id, toIndex) {
    const i = item.steps.findIndex(s => s.id === id);
    if (i < 0) return;
    const [s] = item.steps.splice(i, 1);
    item.steps.splice(toIndex > i ? toIndex - 1 : toIndex, 0, s);
    touch(item);
    rerenderMain();
  }

  function stepKeys(e, item, s) {
    const i = item.steps.indexOf(s);
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      insertStep(item, i + 1, 'action');
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = e.key === 'ArrowUp' ? i - 1 : i + 2;
      if (to >= 0 && to <= item.steps.length) moveStep(item, s.id, to);
    }
  }

  function pickStep(item, s, e) {
    if (e.shiftKey && state.anchor) {
      const a = item.steps.findIndex(o => o.id === state.anchor), b = item.steps.indexOf(s);
      if (a >= 0) {
        state.picked.clear();
        item.steps.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(o => state.picked.add(o.id));
      }
    } else {
      state.picked.has(s.id) ? state.picked.delete(s.id) : state.picked.add(s.id);
      state.anchor = s.id;
    }
    rerenderMain();
  }

  async function makeBlock(c) {
    const picked = c.steps.filter(s => state.picked.has(s.id));
    const ids = picked.map(s => s.id);
    const r = await ask({
      title: 'Make a reusable block',
      body: `The ${plural(picked.length, 'selected step')} move into a new block, and this test case uses the block in their place. Other test cases can then use it too.`,
      input: { placeholder: 'Block name, e.g. Log in as an employee' },
      buttons: [{ label: 'Cancel' }, { label: 'Create block', value: 'ok', primary: true }],
    });
    if (!r || !r.text.trim()) return;
    const before = snapshot(c);
    const id = S.uniqueSlug(r.text, usedIds(P().blocks));
    const block = { kind: 'block', id, title: r.text.trim(), description: '', steps: picked.map(s => ({ id: s.id, type: 'action', action: s.action, expected: s.expected })) };
    P().blocks[id] = block;
    const first = c.steps.findIndex(s => state.picked.has(s.id));
    const use = S.newStep('use', takenIds(c), { block: id });
    for (const s of c.steps) if (s.type === 'repeat') {
      if (ids.includes(s.from)) s.from = use.id;
      if (ids.includes(s.to)) s.to = use.id;
    }
    c.steps = c.steps.filter(s => !state.picked.has(s.id));
    c.steps.splice(first, 0, use);
    state.picked.clear();
    touch(block, c);
    renderAll();
    toast(`Created block “${block.title}”`, {
      label: 'Undo',
      run() { c.steps = before; delete P().blocks[id]; state.deleted.add(`blocks/${id}.md`); touch(c); renderAll(); },
    });
  }

  function repeatPicked(c) {
    const idx = c.steps.map((s, i) => (state.picked.has(s.id) ? i : -1)).filter(i => i >= 0);
    const from = c.steps[idx[0]].id, to = c.steps[idx[idx.length - 1]].id;
    state.picked.clear();
    const s = insertStep(c, c.steps.length, 'repeat', { from, to });
    state.expanded.add(s.id);
    rerenderMain();
  }

  // ---------- case and block operations ----------

  async function newCaseDialog() {
    const cur = currentItem();
    const suite = cur && cur.kind === 'case' ? cur.suite : '';
    const suiteInput = h('input', { class: 'field', value: suite, placeholder: 'Suite (optional)', list: 'suite-list-dlg' });
    const r = await ask({
      title: 'New test case',
      input: { placeholder: 'Title, e.g. Report over $500 requires approval' },
      extra: [suiteInput, h('datalist', { id: 'suite-list-dlg' }, [...new Set(Object.values(P().cases).map(o => o.suite).filter(Boolean))].map(s => h('option', { value: s })))],
      buttons: [{ label: 'Cancel' }, { label: 'Create', value: 'ok', primary: true }],
    });
    if (!r || !r.text.trim()) return;
    const id = S.uniqueSlug(r.text, usedIds(P().cases));
    const c = S.parseCase(id, '');
    c.title = r.text.trim();
    c.suite = suiteInput.value.trim();
    c.steps = [S.newStep('action', new Set())];
    P().cases[id] = c;
    touch(c);
    select({ kind: 'case', id });
    focusStep(c.steps[0].id);
  }

  async function newBlockDialog() {
    const r = await ask({
      title: 'New step block',
      body: 'A block is a set of steps you can drop into any test case, like ADO Shared Steps. Tip: you can also select steps in a test case and choose “Make reusable block”.',
      input: { placeholder: 'Block name, e.g. Log in as an employee' },
      buttons: [{ label: 'Cancel' }, { label: 'Create', value: 'ok', primary: true }],
    });
    if (!r || !r.text.trim()) return;
    const id = S.uniqueSlug(r.text, usedIds(P().blocks));
    const b = { kind: 'block', id, title: r.text.trim(), description: '', steps: [S.newStep('action', new Set())] };
    P().blocks[id] = b;
    touch(b);
    select({ kind: 'block', id });
    focusStep(b.steps[0].id);
  }

  function duplicateCase(c) {
    const id = S.uniqueSlug(c.title + ' copy', usedIds(P().cases));
    const copy = JSON.parse(JSON.stringify(c));
    Object.assign(copy, { id, title: `${c.title} (copy)`, ado_id: '', related: [], state: 'Design' });
    P().cases[id] = copy;
    touch(copy);
    select({ kind: 'case', id });
    toast('Duplicated. Rename it and change what’s different.');
  }

  async function deleteCase(c) {
    const r = await ask({
      title: `Delete “${c.title || 'Untitled test case'}”?`,
      body: state.mode === 'folder' ? `This deletes cases/${c.id}.md from the folder. It doesn't touch anything in Azure DevOps.` : 'This removes it from the demo project.',
      buttons: [{ label: 'Cancel' }, { label: 'Delete', value: 'ok', primary: true }],
    });
    if (!r) return;
    for (const o of Object.values(P().cases)) if (o.related.includes(c.id)) { o.related = o.related.filter(x => x !== c.id); touch(o); }
    delete P().cases[c.id];
    state.deleted.add(pathOf(c));
    touch('settings');
    selectFirst();
    renderAll();
  }

  async function deleteBlock(b) {
    const r = await ask({
      title: `Delete block “${b.title}”?`,
      body: 'No test cases use it, so nothing else changes.',
      buttons: [{ label: 'Cancel' }, { label: 'Delete', value: 'ok', primary: true }],
    });
    if (!r) return;
    delete P().blocks[b.id];
    state.deleted.add(pathOf(b));
    touch('settings');
    selectFirst();
    renderAll();
  }

  function setRelated(a, b, on) {
    const link = (x, y) => { if (on && !x.related.includes(y.id)) x.related.push(y.id); if (!on) x.related = x.related.filter(r => r !== y.id); };
    link(a, b);
    link(b, a);
    touch(a, b);
  }

  // ---------- coverage ----------

  function renderCoverage() {
    const cov = S.coverage(P());
    const reqs = Object.keys(cov).sort((a, b) => (+a - +b) || a.localeCompare(b));
    const unlinked = sortedCases().filter(c => !c.tests.length);
    const caseChip = c => h('button', { class: 'chip plain', type: 'button', style: 'cursor:pointer', onclick: () => select({ kind: 'case', id: c.id }) },
      h('span', { class: `dot ${S.worstLevel(lintOf(c))}`, style: 'margin-right:6px' }), clip(c.title || 'Untitled', 46));
    return h('div', { class: 'doc' },
      h('h1', { style: 'font-size:22px;margin:4px 0 4px' }, 'Requirements coverage'),
      h('p', { class: 'help', style: 'font-size:13.5px' }, 'Which ADO requirements your test cases cover, from each case’s “Covers requirements” links. Add those on the Links tab of a test case.'),
      reqs.length
        ? h('table', { class: 'cov' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Requirement'), h('th', {}, 'Test cases'), h('th', {}, 'Ready'))),
            h('tbody', {}, reqs.map(r => {
              const url = adoUrl(r);
              const ready = cov[r].filter(c => c.state === 'Ready').length;
              return h('tr', {},
                h('td', { class: 'req' }, url ? h('a', { href: url, target: '_blank', rel: 'noopener', class: 'link' }, `#${r}`) : `#${r}`),
                h('td', {}, h('div', { class: 'chips' }, cov[r].map(caseChip))),
                h('td', { class: 'count' }, `${ready} of ${cov[r].length}`));
            })))
        : h('p', {}, 'No test cases are linked to requirements yet.'),
      unlinked.length ? [
        h('h2', { style: 'font-size:15px;margin:28px 0 8px' }, `Not linked to a requirement · ${unlinked.length}`),
        h('div', { class: 'chips' }, unlinked.map(caseChip)),
      ] : null);
  }

  // ---------- panel ----------

  function renderPanel() {
    const panel = $('#panel');
    const item = currentItem();
    if (!item) return panel.replaceChildren(renderProjectChecks());
    const tabs = item.kind === 'case' ? [['links', 'Links'], ['checks', 'Checks'], ['export', 'Export']] : [['links', 'Used by'], ['checks', 'Checks']];
    let tab = state.tab;
    if (!tabs.some(t => t[0] === tab)) tab = 'links';
    const issues = lintOf(item).filter(i => i.level !== 'info');
    const lvl = S.worstLevel(issues);
    const scroll = panel.scrollTop;
    const active = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    panel.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false',
        onclick() { state.tab = k; LS.set('sw.tab', k); renderPanel(); },
      }, label, k === 'checks' && issues.length ? h('span', { class: `n ${lvl}` }, issues.length) : null))),
      h('div', { class: 'pbody', role: 'tabpanel' },
        tab === 'links' ? (item.kind === 'case' ? renderLinks(item) : renderUsedBy(item))
          : tab === 'checks' ? renderChecks(item)
            : renderExport(item)));
    panel.scrollTop = scroll;
    if (active) panel.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus();
  }

  function renderLinks(c) {
    const reqInput = h('input', { class: 'field', placeholder: 'Work item ID, e.g. 1201', inputmode: 'numeric', 'data-key': 'add-req' });
    const addReq = () => {
      const v = reqInput.value.trim().replace(/^#/, '');
      if (!v) return;
      if (!c.tests.includes(v)) c.tests.push(v);
      touch(c);
      renderPanel();
    };
    reqInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addReq(); } });

    const related = S.relatedOf(P(), c);
    const others = sortedCases().filter(o => o.id !== c.id && !related.includes(o.id));
    const sameReq = sortedCases().filter(o => o.id !== c.id && !related.includes(o.id) && o.tests.some(t => c.tests.includes(t)));
    const blocksUsed = [...new Set(c.steps.filter(s => s.type === 'use' && P().blocks[s.block]).map(s => s.block))];

    return [
      h('div', { class: 'psec' },
        h('h3', {}, 'Covers requirements'),
        h('p', { class: 'help' }, 'ADO user stories or requirements this case tests (a “Tests” link in ADO).'),
        c.tests.length ? h('div', { class: 'chips' }, c.tests.map(t => {
          const url = adoUrl(t);
          return h('span', { class: 'chip' }, url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, `#${t}`) : `#${t}`,
            iconBtn('x', `Remove #${t}`, () => { c.tests = c.tests.filter(x => x !== t); touch(c); renderPanel(); }));
        })) : null,
        h('div', { class: 'addrow' }, reqInput, h('button', { class: 'btn small', type: 'button', onclick: addReq }, 'Add')),
        !P().settings.adoBaseUrl && c.tests.length ? h('p', { class: 'help', style: 'margin-top:8px' },
          h('button', { class: 'link', type: 'button', onclick: settingsDialog }, 'Add your ADO project URL'), ' to make these clickable.') : null),

      h('div', { class: 'psec' },
        h('h3', {}, 'Related test cases'),
        h('p', { class: 'help' }, 'Shown on both cases. Kept in Stepwise; ADO imports don’t carry these links.'),
        related.map(id => {
          const o = P().cases[id];
          const oneWay = o && !c.related.includes(id);
          return h('div', { class: 'lrow' },
            h('span', { class: `dot ${o ? S.worstLevel(lintOf(o)) : 'error'}` }),
            o ? h('button', { class: 'link t', type: 'button', onclick: () => select({ kind: 'case', id }) }, o.title || 'Untitled')
              : h('span', { class: 't' }, `${id} (missing)`),
            oneWay ? h('button', { class: 'btn small', type: 'button', title: 'Only the other case links here', onclick() { setRelated(c, o, true); renderPanel(); } }, 'Link back') : null,
            iconBtn('x', 'Remove link', () => {
              if (o) setRelated(c, o, false); else { c.related = c.related.filter(x => x !== id); touch(c); }
              renderPanel();
            }));
        }),
        others.length ? h('select', {
          class: 'field', 'aria-label': 'Link a related test case',
          onchange(e) { const o = P().cases[e.target.value]; if (o) { setRelated(c, o, true); renderPanel(); } },
        }, h('option', { value: '' }, 'Link a related test case…'), others.map(o => h('option', { value: o.id }, clip(o.title || o.id, 60)))) : null),

      sameReq.length ? h('div', { class: 'psec' },
        h('h3', {}, 'Same requirement'),
        h('p', { class: 'help' }, 'Other cases that cover the same requirement.'),
        sameReq.map(o => h('div', { class: 'lrow' },
          h('span', { class: `dot ${S.worstLevel(lintOf(o))}` }),
          h('button', { class: 'link t', type: 'button', onclick: () => select({ kind: 'case', id: o.id }) }, o.title || 'Untitled'),
          h('button', { class: 'btn small', type: 'button', onclick() { setRelated(c, o, true); renderPanel(); } }, 'Relate')))) : null,

      blocksUsed.length ? h('div', { class: 'psec' },
        h('h3', {}, 'Blocks used'),
        blocksUsed.map(id => h('div', { class: 'lrow' }, icon('block'),
          h('button', { class: 'link t', type: 'button', onclick: () => select({ kind: 'block', id }) }, P().blocks[id].title),
          h('span', { class: 'count' }, `used in ${S.blockUsage(P(), id).length}`)))) : null,
    ];
  }

  function renderUsedBy(b) {
    const users = S.blockUsage(P(), b.id);
    return h('div', { class: 'psec' },
      h('h3', {}, `Used by ${plural(users.length, 'test case')}`),
      h('p', { class: 'help' }, 'Changing this block changes all of these.'),
      users.map(c => h('div', { class: 'lrow' },
        h('span', { class: `dot ${S.worstLevel(lintOf(c))}` }),
        h('button', { class: 'link t', type: 'button', onclick: () => select({ kind: 'case', id: c.id }) }, c.title || 'Untitled'))),
      !users.length ? h('p', { class: 'help' }, 'Not used yet. In a test case, choose “Use block” to add it.') : null);
  }

  function renderChecks(item) {
    const issues = lintOf(item);
    const order = { error: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    const real = issues.filter(i => i.level !== 'info');
    return [
      h('div', { class: 'psec' },
        h('h3', {}, 'This ' + (item.kind === 'case' ? 'test case' : 'block')),
        !real.length ? h('p', { class: 'allgood' }, icon('check'), 'No problems found') : null,
        h('ul', { class: 'issues' }, issues.map(i => h('li', {},
          h('button', {
            class: `issue ${i.level === 'info' ? 'info' : ''}`, type: 'button',
            onclick: () => i.step && jumpToStep(i.step),
          }, h('span', { class: `dot ${i.level === 'info' ? '' : i.level}` }), h('span', {}, i.msg)))))),
      renderProjectChecks(item),
    ];
  }

  function renderProjectChecks(except) {
    const rows = [...sortedCases(), ...sortedBlocks()].filter(i => i !== except).map(i => ({ item: i, issues: lintOf(i).filter(x => x.level !== 'info') })).filter(r => r.issues.length);
    return h('div', { class: 'psec', style: except ? null : 'padding:16px' },
      h('h3', {}, 'Rest of the project'),
      rows.length ? rows.map(({ item, issues }) => h('div', { class: 'lrow' },
        h('span', { class: `dot ${S.worstLevel(issues)}` }),
        h('button', { class: 'link t', type: 'button', onclick: () => select({ kind: item.kind, id: item.id }) }, item.title || 'Untitled'),
        h('span', { class: 'count' }, issues.length)))
        : h('p', { class: 'allgood' }, icon('check'), 'Nothing else to fix'),
      h('p', { class: 'help', style: 'margin-top:14px' }, 'These checks catch structural problems.'));
  }

  function jumpToStep(id) {
    const row = document.querySelector(`#main .step[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    row.querySelector('.rich, select')?.focus({ preventScroll: true });
  }

  function seg(key, options, onchange, vertical) {
    return h('div', { class: vertical ? 'seg vertical' : 'seg', role: 'radiogroup' }, options.map(([v, label]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': state.exportOpts[key] === v ? 'true' : 'false',
      onclick() { state.exportOpts[key] = v; LS.set('sw.export', state.exportOpts); onchange(); },
    }, label)));
  }

  // The cells you fill in on an ADO Test Case work item, in order.
  function copySequence(c, rows) {
    const seq = [{ key: 'title', label: 'title', text: c.title }];
    rows.forEach((r, i) => {
      seq.push({ key: `a${i}`, label: `step ${i + 1} action`, text: r.action });
      seq.push({ key: `e${i}`, label: `step ${i + 1} expected result`, text: r.expected });
    });
    const desc = [c.description, c.preconditions && `**Preconditions:**\n${c.preconditions}`].filter(Boolean).join('\n\n');
    if (desc) seq.push({ key: 'desc', label: 'description', text: desc });
    return seq;
  }

  function renderExport(c) {
    const rows = S.flatten(P(), c, state.exportOpts);
    const seq = copySequence(c, rows);
    const pos = Math.min(state.copyPos[c.id] || 0, seq.length);
    const next = seq[pos];
    const setPos = (p, flash) => { state.copyPos[c.id] = p; state.copyFlash = flash || null; renderPanel(); };
    const refresh = () => { renderPanel(); updateLiveLabels(); };
    const indexOf = key => seq.findIndex(s => s.key === key);
    const copyCell = (key, text, label) => {
      const i = indexOf(key);
      return h('button', {
        class: `copycell${i === pos ? ' next' : ''}`, type: 'button', title: `Copy ${label}`,
        async onclick() {
          // Copying a cell by hand also moves "Copy next" to the cell after it.
          if (await copyRich(text)) setPos(i + 1, `Copied ${label}.`);
        },
      }, richText(text));
    };
    const hasBlocks = c.steps.some(s => s.type === 'use');
    const hasRepeats = c.steps.some(s => s.type === 'repeat');

    const copyNext = h('div', { class: 'copynext' },
      h('div', { class: 'cn-head' }, h('h3', {}, 'Copy one cell at a time'), h('span', { class: 'count' }, `${pos} of ${seq.length}`)),
      h('p', { class: 'help' }, `For filling in a Test Case work item. Each click copies the next cell. Tip: after pasting, ${isMac ? '⌘Tab' : 'Alt+Tab'} back here and press Space.`),
      next
        ? h('button', {
            class: 'btn primary cn-btn', type: 'button', 'data-key': 'copy-next',
            async onclick() {
              if (!next.text) return setPos(pos + 1, `Skipped ${next.label}: it’s empty.`);
              if (await copyRich(next.text)) setPos(pos + 1, `Copied ${next.label}.`);
            },
          }, icon('copy'), next.text ? `Copy ${next.label}` : `Skip ${next.label} (empty)`)
        : h('p', { class: 'allgood' }, icon('check'), `All ${seq.length} cells done`),
      next && next.text ? richText(next.text, 'div', { class: 'cn-next' }) : null,
      state.copyFlash ? h('p', { class: 'cn-done', role: 'status' }, state.copyFlash) : null,
      h('div', { class: 'cn-actions' },
        h('button', { class: 'btn small', type: 'button', disabled: pos === 0, onclick: () => setPos(pos - 1) }, 'Back'),
        h('button', { class: 'btn small', type: 'button', disabled: pos === 0, onclick: () => setPos(0) }, 'Start over')));

    return [
      h('div', { class: 'psec' },
        h('h3', {}, 'Send this case to ADO'),
        h('p', { class: 'help' }, 'Steps are numbered the way ADO will number them, so “Repeat steps” stays correct.'),
        hasBlocks ? h('div', { class: 'opt' }, h('span', { class: 'lbl' }, 'Blocks'), seg('blocks', [['inline', 'Write the steps out every time'], ['once', 'Write them out once, then “Repeat steps”'], ['name', 'One step naming the block']], refresh, true)) : null,
        hasRepeats ? h('div', { class: 'opt' }, h('span', { class: 'lbl' }, 'Repeats'), seg('repeats', [['text', 'Say “Repeat steps 3–6”'], ['inline', 'Write the steps out again']], refresh)) : null,
        copyNext,
        h('details', { class: 'bulk' },
        h('summary', {}, 'Send it all at once (needs Test Plans access)'),
        h('div', { class: 'opt' }, h('span', { class: 'lbl' }, 'Title when pasting'), seg('titleRow', [['own', 'On its own row'], ['first', 'On the step 1 row']], refresh)),
        h('div', { class: 'export-actions' },
          h('button', {
            class: 'btn', type: 'button',
            async onclick() { if (await copyText(S.toGridTSV(c, rows, state.exportOpts))) toast('Copied. Paste into the ADO grid view.'); },
          }, icon('copy'), 'Copy for ADO grid'),
          h('button', {
            class: 'btn', type: 'button',
            onclick() { saveExport(`${c.id}.csv`, S.toCSV(P(), [c], state.exportOpts)); },
          }, icon('download'), 'CSV')),
        h('ol', { class: 'how' },
          h('li', {}, h('b', {}, 'Grid: '), 'in Test Plans, open the suite, switch to Grid view, click the first empty Title cell and paste. Save.'),
          h('li', {}, h('b', {}, 'CSV: '), 'in Test Plans, open the suite, choose Import test cases from CSV, and pick the file. Rows with an ADO ID update that case.'),
          h('li', {}, 'Afterwards, put the new ADO ID into the case here so later CSVs update it instead of making a copy.'))),
        h('h3', { class: 'preview-head' }, 'Preview'),
        h('table', { class: 'preview' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Step action'), h('th', {}, 'Expected result'))),
          h('tbody', {},
            h('tr', {}, h('td', { class: 'n' }, 'T'), h('td', { colspan: 2 }, copyCell('title', c.title, 'title'))),
            rows.map((r, i) => h('tr', { class: `k-${r.kind}`, title: r.block ? `From block: ${r.block}` : null },
              h('td', { class: 'n' }, i + 1),
              h('td', {}, copyCell(`a${i}`, r.action, `step ${i + 1} action`)),
              h('td', {}, copyCell(`e${i}`, r.expected, `step ${i + 1} expected result`)))),
            indexOf('desc') >= 0 ? h('tr', {}, h('td', { class: 'n' }, 'D'), h('td', { colspan: 2 }, copyCell('desc', seq[indexOf('desc')].text, 'description'))) : null)),
        h('div', { class: 'legend' }, h('span', {}, 'Click any cell to copy it.'), hasBlocks && h('span', { class: 'b' }, h('b', {}, '#'), ' from a block'), hasRepeats && h('span', { class: 'r' }, h('b', {}, '#'), ' repeat'))),
    ];
  }

  // ---------- dialogs ----------

  function ask({ title, body, input, extra, buttons, validate }) {
    return new Promise(resolve => {
      const d = $('#dialog');
      let inp = null;
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        d.close();
        resolve(value == null ? null : (inp ? { value, text: inp.value } : value));
      };
      if (input) inp = h('input', { class: 'field', value: input.value || '', placeholder: input.placeholder || '' });
      const primary = buttons.find(b => b.primary);
      const form = h('form', {
        class: 'dlg', onsubmit(e) { e.preventDefault(); if (primary && (!validate || validate(inp ? inp.value : ''))) finish(primary.value); },
      },
        h('h2', {}, title),
        body ? (typeof body === 'string' ? h('p', {}, body) : body) : null,
        inp, extra || null,
        h('div', { class: 'dlg-actions' }, buttons.map(b => h('button', {
          class: b.primary ? 'btn primary' : 'btn', type: b.primary ? 'submit' : 'button',
          onclick: b.primary ? null : () => finish(b.value ?? null),
        }, b.label))));
      d.replaceChildren(form);
      d.oncancel = e => { e.preventDefault(); finish(null); };
      // A close event left over from the previous dialog can arrive after this one opens; only react if it's really closed.
      d.onclose = () => { if (!d.open) finish(null); };
      d.showModal();
      (inp || form.querySelector('.btn.primary'))?.focus();
    });
  }

  function scopeSelect() {
    const cases = sortedCases();
    const suites = [...new Set(cases.map(c => c.suite).filter(Boolean))];
    const cur = currentItem();
    const opts = [['all', `All test cases (${cases.length})`]];
    if (cur && cur.kind === 'case') opts.unshift(['current', `This test case: ${clip(cur.title, 40)}`]);
    for (const s of suites) opts.push([`suite:${s}`, `Suite: ${s} (${cases.filter(c => c.suite === s).length})`]);
    const ready = cases.filter(c => c.state === 'Ready').length;
    if (ready) opts.push(['ready', `Ready to import (${ready})`]);
    const el = h('select', { class: 'field' }, opts.map(([v, l]) => h('option', { value: v }, l)));
    el.value = 'all';
    el.pick = () => {
      const v = el.value;
      if (v === 'current') return [cur];
      if (v === 'ready') return cases.filter(c => c.state === 'Ready');
      if (v.startsWith('suite:')) return cases.filter(c => c.suite === v.slice(6));
      return cases;
    };
    return el;
  }

  async function exportDialog() {
    const scope = scopeSelect();
    const o = state.exportOpts;
    const r = await ask({
      title: 'Export CSV for ADO',
      body: h('p', {}, `For Test Plans → Import test cases from CSV. Blocks are ${{ inline: 'written out every time', once: 'written out once, then repeated by step number', name: 'named in one step' }[o.blocks]} and repeats ${o.repeats === 'text' ? 'say “Repeat steps …”' : 'are written out'} (change this on a case’s Export tab). The file also opens in Excel.`),
      extra: [h('span', { class: 'lbl' }, 'Which test cases'), scope],
      buttons: [{ label: 'Cancel' }, { label: 'Save CSV…', value: 'ok', primary: true }],
    });
    if (!r) return;
    const cases = scope.pick();
    const name = state.mode === 'folder' ? S.slugify(baseName(state.root)) : 'stepwise';
    saveExport(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, S.toCSV(P(), cases, o), plural(cases.length, 'test case'));
  }

  async function settingsDialog() {
    const url = h('input', { class: 'field', value: P().settings.adoBaseUrl || '', placeholder: 'https://dev.azure.com/your-org/your-project' });
    const buttons = [{ label: 'Cancel' }, { label: 'Save', value: 'ok', primary: true }];
    if (state.mode === 'demo') buttons.unshift({ label: 'Reset demo data', value: 'reset' });
    const addFiles = state.mode === 'folder' ? h('p', { class: 'help' },
      h('button', {
        class: 'link', type: 'button',
        async onclick() {
          $('#dialog').close();
          const n = await addClaudeFiles();
          if (state.current) { state.current.claudeFiles = true; saveFolders(); }
          toast(n ? `Added ${plural(n, 'file')} for Claude` : 'The files for Claude are all there already');
        },
      }, 'Add the files Claude Code uses'), ' (AGENTS.md, CLAUDE.md and the /audit, /draft-case and /find-blocks commands) where they’re missing.') : null;
    const r = await ask({
      title: 'Settings',
      body: h('div', {}, h('p', {}, 'Your Azure DevOps project URL. Used to make work item IDs clickable. Saved in stepwise.json.'), addFiles),
      extra: [h('span', { class: 'lbl' }, 'ADO project URL'), url],
      buttons,
    });
    if (r === 'reset') {
      state.project = loadFiles(window.StepwiseSample);
      LS.set('sw.demo', null);
      selectFirst();
      renderAll();
      return;
    }
    if (!r) return;
    const value = url.value.trim();
    if (value && !safeBaseUrl(value)) {
      toast('Use a web address starting with https://');
      return;
    }
    P().settings.adoBaseUrl = value;
    touch('settings');
    renderAll();
  }

  // ---------- output ----------

  // Puts both formatted (HTML) and plain text on the clipboard, so bold survives a paste into ADO.
  // The Rust side writes it, which works the same in every system webview.
  function copyRich(md) {
    return copyText(S.inlineToPlain(md), S.inlineToHtml(md));
  }

  async function copyText(text, html) {
    try {
      await invoke('copy_text', { text, html: html ?? null });
      return true;
    } catch (e) {
      console.error(e);
      toast("Couldn't copy to the clipboard");
      return false;
    }
  }

  // Asks where to save the file (the Rust side shows the save dialog and writes it).
  async function saveExport(name, text, what) {
    try {
      const path = await invoke('export_file', { name, text });
      if (path) toast(what ? `Saved ${what} to ${baseName(path)}` : `Saved ${baseName(path)}`);
    } catch (e) {
      toast(`Couldn't save the file: ${e}`);
    }
  }

  function toast(msg, action, ms) {
    const t = $('#toast');
    t.replaceChildren(...[h('span', {}, msg), action && h('button', { type: 'button', onclick() { action.run(); t.classList.remove('show'); } }, action.label)].filter(Boolean));
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms || (action ? 7000 : 2600));
  }

  // ---------- boot ----------

  $('#search').addEventListener('input', e => { state.search = e.target.value; renderSide(); });
  $('#scrim').addEventListener('click', () => { setDrawer('side', false); setDrawer('panel', false); });
  $('#switcher').addEventListener('beforetoggle', e => { if (e.newState === 'open') renderSwitcher(); });
  $('#switcher').addEventListener('toggle', e => {
    if (e.newState !== 'open') return;
    placeSwitcher();
    $('#switcher .menu-item[aria-current="true"], #switcher .menu-item')?.focus();
  });
  window.addEventListener('resize', () => { if (menuOpen()) placeSwitcher(); });
  // Without the popover API, close the folder menu on a click elsewhere or Escape.
  if (!hasPopover) {
    document.addEventListener('pointerdown', e => {
      if (menuOpen() && !e.target.closest('#switcher, #top .proj')) setMenu(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen()) setMenu(false); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  // Web links (ADO work items, docs) open in the default browser rather than inside the app.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !/^https?:/i.test(a.href)) return;
    e.preventDefault();
    invoke('open_url', { url: a.href }).catch(err => toast(`Couldn't open the link: ${err}`));
  });
  listen('workspace-changed', onExternalChanges);
  listen('watch-error', ({ root, error }) => {
    if (root === state.root && !state.watchWarned) toast(watchProblem(error), null, 12000);
  });
  // Closing the window waits for the last edits to be saved, and for you to settle any conflict.
  listen('close-requested', async () => {
    invoke('hold_close');
    if (!(await settle())) return;
    if (state.dirty.size || state.deleted.size) {
      const r = await ask({
        title: 'Some changes couldn’t be saved',
        body: 'Stepwise couldn’t write them to the folder. If you quit now, they’re lost.',
        buttons: [{ label: 'Don’t quit' }, { label: 'Quit anyway', value: 'quit', primary: true }],
      });
      if (!r) return;
    }
    invoke('quit');
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); flush(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o' && !$('#dialog').open) { e.preventDefault(); setMenu(!menuOpen()); }
    if (e.key === 'Escape' && !$('#dialog').open) {
      if ($('.app').matches('.side-open, .panel-open')) { setDrawer('side', false); setDrawer('panel', false); }
      else if (state.picked.size) { state.picked.clear(); rerenderMain(); }
    }
  });

  async function boot() {
    const demo = LS.get('sw.demo', null);
    state.project = loadFiles(demo || window.StepwiseSample);
    const saved = LS.get('sw.sel', null);
    state.sel = saved;
    if (!saved || (saved.kind !== 'coverage' && !currentItem())) selectFirst();
    renderAll();
    state.folders = await invoke('load_folders').catch(() => []);
    renderTop();
    // Reopen the folder you were last working in.
    const first = state.folders[0];
    if (first && LS.get('sw.mode', 'folder') !== 'demo') await openFolder(first.path, { entry: first, quiet: true });
  }
  boot();
})();
