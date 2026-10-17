# Stepwise

A desktop editor for Azure DevOps manual test cases, with Claude Code built in. Test cases are plain
Markdown files in a folder you choose, so Claude can read, audit and draft them, git can track them,
and teammates can share them. Runs on macOS, Windows and Linux.

## Install

Download the installer for your computer from the
[Releases](https://github.com/WebbontheWeb/stepwise/releases) page:

- **macOS**: the `.dmg` (`aarch64` for Apple Silicon, `x64` for Intel). Drag Stepwise to Applications.
- **Windows**: the `.msi` or the `-setup.exe`.
- **Linux**: the `.AppImage` (make it executable and run it), `.deb` or `.rpm`.

The builds aren't code-signed yet, so the first launch needs an extra step:

- **macOS**: open Stepwise once, then go to System Settings → Privacy & Security and choose
  **Open Anyway**. If macOS says the app "is damaged", that's the download quarantine on an unsigned
  app; run `xattr -dr com.apple.quarantine /Applications/Stepwise.app` in Terminal and open it again.
- **Windows**: if SmartScreen stops it, choose **More info** → **Run anyway**.

### Build it yourself

You need [Node.js](https://nodejs.org) 18 or later, [Rust](https://rustup.rs), and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system (Xcode Command Line
Tools on macOS, the Microsoft C++ Build Tools and WebView2 on Windows, WebKitGTK on Linux).

```sh
npm install
npm run build
```

The app ends up in `src-tauri/target/release/bundle/` (on macOS, `macos/Stepwise.app` and a `.dmg`).
`npm run dev` runs it from source while you work on it.

## Start

1. Open Stepwise. It starts with a sample project kept inside the app, so you can try things out.
2. Click **Open folder** and pick (or create) a folder for your real test cases. Stepwise adds
   `cases/`, `blocks/`, `stepwise.json`, and files that let Claude work on the cases with you (see
   below). After that, every edit is saved to the files automatically.

### Switching between folders

Click the folder name in the top bar (or press **⌘O**, **Ctrl+O** on Windows and Linux) to switch
between the folders you've opened, for example one per client. Each folder remembers which case you
had open, and Stepwise reopens the last folder when it starts. You can rename entries (handy when two
folders share a name) or remove them from the list; removing never touches files.

The list is saved in Stepwise's own settings folder, never in a repository or a test case folder:

| System | Folder list |
| --- | --- |
| macOS | `~/Library/Application Support/io.github.webbontheweb.stepwise/folders.json` |
| Windows | `%APPDATA%\io.github.webbontheweb.stepwise\folders.json` |
| Linux | `~/.config/io.github.webbontheweb.stepwise/folders.json` |

## Your data stays separate from the app

This repository contains only the app and fictional demo data. Your test cases never live here:

- **Real test cases** are saved only in the folder you open. Keep that folder somewhere else (its
  own private repo, a shared drive, or just your machine). `.gitignore` excludes `cases/`, `blocks/`,
  `stepwise.json` and CSV exports just in case.
- **Demo mode** edits are kept in the app's local storage, not in any file.
- **Your list of folders** is kept in Stepwise's settings folder (above).
- **Stepwise itself makes no network calls.** No analytics, no CDNs, no uploads. Links to ADO open
  in your browser only when you click them, using the project URL you set. Claude Code, when you use
  it, talks to Anthropic as it always does.
- **Demo data** (`src/sample.js`) is a made-up expense-report app ("Expense Hub").

## Writing steps

- **⌘↵** adds a step below, **⌥↑ / ⌥↓** moves a step, or drag the handle. On Windows and Linux use
  Ctrl and Alt.
- **⌘B** and **⌘I** make text bold or italic in steps, expected results and descriptions. It's
  saved as Markdown (`**bold**`) and survives a paste into ADO.
- **Use block** inserts a reusable set of steps (like ADO Shared Steps, but easier to edit). Click
  the step count to expand it in place.
- **Repeat steps** points at an earlier range ("repeat steps 3–4 as a manager"). It follows the steps
  it points at, so the numbers stay right when you insert, delete or move steps.
- Click step numbers (Shift-click for a range) to select steps, then **Make reusable block** or
  **Repeat at end**.

## Links

The **Links** tab holds the requirements a case covers (ADO work item IDs) and related test cases.
Related links show on both cases. **Requirements coverage** shows which requirements have cases.
Set your ADO project URL under Settings to make IDs clickable.

ADO's paste and CSV import don't carry links, so these stay in Stepwise. Add them in ADO by hand if
you need them there.

## Getting cases into ADO

On a case's **Export** tab:

- **Copy one cell at a time**: for filling in a Test Case work item by hand (no Test Plans access
  needed). Each click copies the next cell (title, then each step's action and expected result,
  then the description) and moves on. Empty cells are skipped for you. After pasting, ⌘Tab (Alt+Tab)
  back and press Space to copy the next one.
- **Copy for ADO grid**: in Test Plans, open the suite, switch to Grid view, click the first empty
  Title cell and paste.
- **Click any cell** in the preview to copy just that cell.
- **CSV**: for Test Plans' *Import test cases from CSV*. The **Export CSV** button in the top bar
  exports many cases at once; Stepwise asks where to save the file.

Choose how blocks go out: written out every time, written out once with later uses turned into
"Repeat steps 3–5", or as one step naming the block. Repeats either say "Repeat steps 3–6"
(numbered to match what ADO receives) or are written out again.

In narrow windows (say, side by side with ADO) the case list and the details panel slide in from
the edges, so the Export tab and Copy next stay one click away.

After the first import, put the ADO ID into the case so later CSVs update it instead of creating
a duplicate.

## Working with Claude

Claude Code runs in a panel inside Stepwise, right in your test case folder. It's the real Claude
Code, using **your own Claude Code login** (your Claude subscription or API account), so install it
first: see [Set up Claude Code](https://code.claude.com/docs/en/setup). Stepwise doesn't sign in to
anything itself.

Open the panel with **Work with Claude** in the top bar or **⌘J** (Ctrl+J). It starts your usual
shell in the folder and runs `claude` there, so if you quit Claude Code you're still in a terminal
in the right place. Each folder gets its own terminal, which keeps running while you switch folders.
Drag the panel's top edge to resize it. The buttons in its header type a command for you:

- **Review this case**: `/audit cases/<case>.md`
- **Review all cases**: `/audit`
- **Draft cases from a user story**: types `/draft-case ` so you can paste the story, then press Return
- **Find steps worth reusing**: `/find-blocks`
- **Restart**: ends the terminal and starts a fresh one

The Checks tab has a **Review this case with Claude** button too.

### Reviewing Claude's changes

Stepwise watches `cases/`, `blocks/` and `stepwise.json`. When Claude (or a teammate, or git) changes
a file, Stepwise reloads it straight away, marks it **updated** in the sidebar, and lists it under
**Changes from Claude**. There you see each file's changes line by line and choose **Keep** or
**Undo** (or **Keep all** / **Undo all**). Undo puts the file back as it was: it rewrites a changed
file, deletes a new one, or restores a deleted one. Editing a changed file in Stepwise keeps its
change.

### What Stepwise adds to a folder

- `AGENTS.md`: the file format, rules for writing good test cases, and how to work in the folder.
  Other AI coding tools read this file too.
- `CLAUDE.md`: a one-line pointer so Claude Code loads `AGENTS.md`.
- `.claude/commands/`: `/audit` (review cases and suggest fixes), `/draft-case` (turn a user story
  into cases) and `/find-blocks` (spot repeated steps that should be blocks).

Stepwise only adds these files if they're missing, so you can edit them to suit your team.

The **Checks** tab catches structural problems (missing expected results, broken references,
duplicate titles) as you type.

## Known gaps

- The builds aren't code-signed or notarized yet (see Install).
- ADO's grid view paste has been built from the documented format. If your title lands in the
  wrong place, switch "Title when pasting" on the Export tab.
- The CSV columns follow ADO's test case export. If your organization's import complains, compare
  against an export from your own project.

## Files

| File | What it is |
| --- | --- |
| `src/index.html`, `src/styles.css`, `src/app.js` | The app's window |
| `src/core.js` | File format, export, checks and diffs (no UI) |
| `src/sample.js` | Fictional demo data |
| `src/workspace.js` | The AGENTS.md, CLAUDE.md and commands added to test case folders |
| `src-tauri/` | The desktop app (Tauri): files, folder list, file watching and the terminal |
| `scripts/vendor.mjs` | Copies xterm.js into `src/vendor/` before each build |
| `test.js` | `node test.js` runs the format and export tests |
| `.github/workflows/` | CI, and release builds for macOS, Windows and Linux |

## License

MIT. See [LICENSE](LICENSE).
