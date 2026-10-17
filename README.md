# Stepwise

A desktop editor for Azure DevOps manual test cases that works with your AI assistant. Test cases
are plain Markdown files in a folder you choose, so Claude or Codex can read, review and draft them
(including from a recording of you talking through a test session), git can track them, and
teammates can share them. Runs on macOS, Windows and Linux.

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
   `cases/`, `blocks/`, `stepwise.json`, and files that let an AI assistant work on the cases with
   you (see below). After that, every edit is saved to the files automatically.

If a file changes on disk while you have unsaved edits to it (an AI assistant, a teammate or a sync
service got there first), Stepwise doesn't overwrite it: it asks whether to keep your version or the one on
disk.

### Switching between folders

Click the folder name in the top bar (or press **⌘O**, **Ctrl+O** on Windows and Linux) to switch
between the folders you've opened, for example one per client. Each folder remembers which case you
had open, and Stepwise reopens the last folder when it starts. You can rename entries (handy when two
folders share a name) or remove them from the list; removing never touches files.

The list (and each folder's unreviewed changes, under `reviews/`, and your choice of AI assistant,
in `settings.json`) is saved in Stepwise's own settings folder, never in a repository or a test case
folder:

| System | Settings folder |
| --- | --- |
| macOS | `~/Library/Application Support/io.github.webbontheweb.stepwise/` |
| Windows | `%APPDATA%\io.github.webbontheweb.stepwise\` |
| Linux | `~/.config/io.github.webbontheweb.stepwise/` |

## Your data stays separate from the app

This repository contains only the app and fictional demo data. Your test cases never live here:

- **Real test cases** are saved in the folder you open. Keep that folder somewhere else (its
  own private repo, a shared drive, or just your machine). This repo's `.gitignore` excludes `cases/`,
  `blocks/`, `transcripts/`, `stepwise.json` and CSV exports just in case.
- **Changes waiting for review** are the one exception: until you keep or undo them, copies of
  the changed files' text (before and after) are kept in Stepwise's settings folder (above). They're
  deleted once reviewed, and when you remove the folder from the list. On Windows that settings
  folder is in roaming AppData, which some organizations sync.
- **Demo mode** edits are kept in the app's local storage, not in any file.
- **Your list of folders** is kept in Stepwise's settings folder (above).
- **Stepwise itself makes no network calls.** No analytics, no CDNs, no uploads. Links to ADO open
  in your browser only when you click them, using the project URL you set. Work with AI opens your
  own Claude or Codex app, which talks to Anthropic or OpenAI as it always does.
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

## Working with AI

Stepwise doesn't run an AI assistant itself. **Work with AI** in the top bar opens your test case
folder in the assistant you already use, signed in to **your own account and subscription**:

| Assistant (Settings → AI assistant) | Opens | Link it uses |
| --- | --- | --- |
| **Claude (desktop app)** | A new Claude Code session in the Claude app. Claude asks you to confirm the folder. | `claude://code/new?folder=…&q=…` |
| **Claude Code (terminal)** | A new terminal window running `claude` in the folder. | `claude-cli://open?cwd=…&q=…` |
| **Codex** | A new chat in the Codex app, in the folder. | `codex://new?path=…&prompt=…` |

The choice is kept in Stepwise's settings folder, not in your test case folder. From the same dialog
you can start with a prompt already typed in. Nothing is sent until you read it and send it:

- **Review this case** and **Review all cases**: checks steps, expected results, preconditions and
  coverage, then asks which fixes to make. The Checks tab has a **Review this case with AI** button.
- **Draft cases from a user story**: paste the story after the prompt.
- **Find steps worth reusing**: repeated steps that could become blocks.
- **New cases from transcript**: see below.

Each prompt is one line that points at a workflow in the folder's `AGENTS.md`, so Claude and Codex
follow the same steps and the prompt fits in a link.

If the assistant isn't installed, Stepwise says so and links to where to get it. Claude Code's
`claude-cli://` links work once you've run `claude` in a terminal and sent it a message: that's when
Claude Code registers them.

### New cases from a transcript

Narrate what you do and see while you test on a device, record it, and get a transcript (any
recorder or dictation app). Then choose **Work with AI** → **New cases from transcript**, give the
session a title, and paste the transcript or drop the text file (`.txt`, `.md`, `.vtt`, `.srt`) on
the box. Stepwise saves it as `transcripts/<date>-<title>.md` in the test case folder (never
replacing an earlier one) and opens the assistant with a prompt pointing at that file. A long
transcript wouldn't fit in a link, and the file keeps a record of the session.

Because the transcript is saved in the test case folder, anyone who can open that folder can read
it. If the folder is a git repository (perhaps one shared with a client), the dialog says so and
offers to add `transcripts/` to that folder's `.gitignore`. It only does that if you tick the box.

The assistant follows the "Cases from a transcript" workflow in `AGENTS.md`: it splits the session
into cases in Stepwise's format, reuses your blocks, uses repeat steps where you repeated a sequence,
sets `state: Design`, never invents an expected result (it writes `Expected: TODO: what should
happen?` instead), and lists its open questions. It shows you the plan before writing any files.

### Which links were checked where

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Claude (desktop app) | Checked (Claude 2.42304): opens a session in the folder after you confirm it | Supported by Claude, not tested | Supported by Claude, not tested |
| Claude Code (terminal) | Checked (Claude Code 2.1.302): Terminal opens with `claude` in the folder and the prompt passed in, after its folder-trust question | Supported by Claude Code, not tested | Supported by Claude Code, not tested |
| Codex | Opens the Codex app (inside ChatGPT 26.1013); folder and prompt not checked on screen | Codex app exists, not tested | No Codex app yet: Stepwise says so |

On Windows and Linux Stepwise first checks that something handles the link (the registry, or
`xdg-mime`), so a missing app gives a message instead of nothing happening.

### Reviewing outside changes

Stepwise watches `cases/`, `blocks/` and `stepwise.json`. When an AI assistant, a teammate or git
changes a file, Stepwise reloads it straight away, marks it **updated** in the sidebar, and lists it
under **Outside changes**. There you see each file's changes line by line and choose **Keep** or
**Undo** (or **Keep all** / **Undo all**). Undo puts the file back as it was: it rewrites a changed
file, deletes a new one, or restores a deleted one. Editing a changed file in Stepwise keeps its
change. Changes waiting for review are kept per folder, so they're still there after you switch
folders (including changes made in a folder you've switched away from) or restart Stepwise.

### What Stepwise adds to a folder

- `AGENTS.md`: the file format, rules for writing good test cases, how to work in the folder, and
  the workflows the prompts use (review cases, draft cases from a user story, find steps worth
  reusing, cases from a transcript). Claude Code, Codex and other AI tools read this file.
- `CLAUDE.md`: a one-line pointer so Claude Code loads `AGENTS.md`.
- `.claude/commands/`: `/audit`, `/draft-case`, `/find-blocks` and `/from-transcript`, which run those
  workflows when you type them in Claude Code.
- `transcripts/`: only when you save a transcript.

Setting up a new folder adds them; for a folder that already has test cases, Stepwise asks once and
remembers your answer. It doesn't put back files you delete, so you can edit or remove them to suit
your team. When a new version of Stepwise changes these files, it offers the update once: files it
wrote that nobody edited are replaced, an edited `AGENTS.md` keeps your text and gets the new
workflows added at the end, and anything else is left alone. Settings has a link to add or update
them at any time.

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
| `src/workspace.js` | The AGENTS.md, CLAUDE.md and commands added to test case folders, and the Work with AI prompts |
| `src-tauri/` | The desktop app (Tauri): files, folder list, file watching, settings and opening the AI assistant |
| `test.js` | `node test.js` runs the format, export and workspace file tests; `cargo test` in `src-tauri/` runs the backend's |
| `.github/workflows/` | CI, and release builds for macOS, Windows and Linux |

## License

MIT. See [LICENSE](LICENSE).
