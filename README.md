# Stepwise

A local editor for Azure DevOps manual test cases. Test cases are plain Markdown files in a
folder you choose, so Claude can read and audit them, git can track them, and teammates can
share them.

## Start

1. Open `index.html` in **Chrome or Edge** (double-click it). It opens with a sample project
   saved in the browser, so you can try things out.
2. Click **Open folder** and pick (or create) a folder for your real test cases. Stepwise adds
   `cases/`, `blocks/`, `stepwise.json`, and files that let Claude work on the cases with you (see
   below). After that,
   every edit is saved to the files automatically.

### Open it like an app (Mac)

```sh
./scripts/install-mac-launcher.sh
```

This creates `Stepwise.app` in your user Applications folder. It opens Stepwise in its own
Chrome window (or pass `"Microsoft Edge"` to use Edge), so you can launch it from Spotlight,
Launchpad or the Dock. If you move this folder, run the script again.

## Your data stays separate from the app

This repository contains only the app and fictional demo data. Your test cases never live here:

- **Real test cases** are saved only in the folder you open. Keep that folder somewhere else (its
  own private repo, a shared drive, or just your machine). Stepwise refuses to use its own app
  folder for test cases, and `.gitignore` excludes `cases/`, `blocks/`, `stepwise.json` and CSV
  exports just in case.
- **Demo mode** edits are kept in your browser's local storage, not in any file.
- **No network calls.** No analytics, no CDNs, no uploads. Links to ADO only open when you click
  them, using the project URL you set.
- **Demo data** (`sample.js`) is a made-up expense-report app ("Expense Hub").

## Writing steps

- **⌘↵** adds a step below, **⌥↑ / ⌥↓** moves a step, or drag the handle.
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
  then the description) and moves on. Empty cells are skipped for you. After pasting, ⌘Tab back
  and press Space to copy the next one.
- **Copy for ADO grid**: in Test Plans, open the suite, switch to Grid view, click the first empty
  Title cell and paste.
- **Click any cell** in the preview to copy just that cell.
- **CSV**: for Test Plans' *Import test cases from CSV*. The **Export CSV** button in the top bar
  exports many cases at once.

Choose whether blocks are written out as steps or named in one step, and whether repeats say
"Repeat steps 3–6" (numbered to match what ADO receives) or are written out again.

After the first import, put the ADO ID into the case so later CSVs update it instead of creating
a duplicate.

## Working with Claude

Claude works directly in your test case folder rather than through copy and paste. When Stepwise
sets up a folder it adds:

- `AGENTS.md`: the file format, rules for writing good test cases, and how to work in the folder.
  Other AI coding tools read this file too.
- `CLAUDE.md`: a one-line pointer so Claude Code loads `AGENTS.md`.
- `.claude/commands/`: `/audit` (review cases and suggest fixes), `/draft-case` (turn a user story
  into cases) and `/find-blocks` (spot repeated steps that should be blocks).

Stepwise only adds these files if they're missing, so you can edit them to suit your team.

Open the folder in Claude Code (the Claude desktop app's Code tab, or `claude` in a terminal), ask
for what you need, then switch back: Stepwise reloads changed files and marks those cases as
**updated** in the sidebar. **Work with Claude** in the top bar shows these steps.

The **Checks** tab catches structural problems (missing expected results, broken references,
duplicate titles) as you type.

## Known gaps

- ADO's grid view paste has been built from the documented format. If your title lands in the
  wrong place, switch "Title when pasting" on the Export tab.
- The CSV columns follow ADO's test case export. If your organization's import complains, compare
  against an export from your own project.
- Opening folders needs Chrome or Edge (it uses the File System Access API).

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app |
| `core.js` | File format, export and checks (no UI) |
| `sample.js` | Fictional demo data |
| `workspace.js` | The AGENTS.md, CLAUDE.md and commands added to test case folders |
| `test.js` | `node test.js` runs the format and export tests |
| `scripts/install-mac-launcher.sh` | Makes a Spotlight-launchable Mac app |
| `assets/icon.svg` | App icon |

## License

MIT. See [LICENSE](LICENSE).
