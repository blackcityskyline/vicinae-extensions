# LaunchBar File Manager

Browse, preview and organize files without leaving the keyboard — LaunchBar-style
file management in Vicinae.

| Command | Does |
| --- | --- |
| Browse Files | The file browser: drill with the keyboard, select, transfer, rename, compress |
| Transfer Clipboard Paths | Sends the paths on the clipboard through the transfer tree, without opening the browser first |

Port of [imed/launchbar-file-manager](https://github.com/raycast/extensions/tree/main/extensions/launchbar-file-manager)
(MIT). See **Linux differences** for what changed and why.

## Browsing

Open **Browse Files**. You start in the starting folder, or in the last folder
you left (see settings).

- **Move around:** `Enter` or `ctrl+→` enters a folder, `ctrl+←` (or `ctrl+[`)
  goes up one. The bare arrow keys are the list's own: `←`/`→` do nothing, and
  they never reach an action — see **Keys**. Unlike the macOS original the
  highlight does not land on the folder you just left: Vicinae's `List` cannot
  move the highlight from code.
- **Find things:** type to filter the current folder. Matching is fuzzy, so
  abbreviations (`vsc` finds Visual Studio Code) and small typos (`documnets`
  finds Documents) still match. The search bar shows the path, the item count
  and the number of selected files.
- **Open and look:** `Enter` opens a file or enters a folder. `ctrl+Enter` on a
  file opens the preview pane (see **Preview**).
  `Open With…` lists the desktop entries that claim the file's type
  (`getApplications`), Enter opens the file with the chosen one. `ctrl+i` shows
  the details pane: kind, size, modified, full path.
- **Jump around:** every row's action menu has Go actions for Home, the XDG
  Desktop/Documents/Downloads folders, and `/`. `Toggle Hidden Files` flips
  dotfiles for the session.

## Preview

Vicinae has no Quick Look: `Action.ToggleQuickLook` is a no-op stub and a list
row cannot show a preview panel of its own. `ctrl+Enter` therefore pushes a
full-screen detail view that renders the file itself:

- images — inline, through `file://` in the markdown (the same trick `iskra`
  and `url-kit` use);
- `.md` — as markdown;
- source, config and text files — as a syntax-labelled code block, cut at 64 KB;
- everything else — a note and two actions, **Open** and **Preview in Sushi**.

`Esc` returns to the list, because this is ordinary back navigation and not a
separate window. For video, audio and PDFs the pane offers **Preview in GNOME
Sushi**: a D-Bus call that draws the very preview window Nautilus uses. Sushi is
D-Bus activated, so nothing runs while it is unused; it is optional, and the
pane works without it.

## Selecting several files

There is no Shift+`↑`/`↓` run: Vicinae cannot move the highlight while a
shortcut fires, which is what the original used to build the selection. Select
one row at a time from the action menu (`Select`/`Deselect`), or with
`ctrl+shift+a` (everything in the folder) and `ctrl+shift+f` (the filtered
results only). `ctrl+shift+x` clears the selection.

The search bar counts the selection. With files selected, the action menu offers
the batch operations: trash them all, compress them into one ZIP, or copy their
paths. The selection is temporary: leaving the browser, finishing a transfer or
cancelling one deselects everything.

## Moving and copying (the `Tab` flow)

One flow for one file and for many:

1. **Pick what to move.** Highlight a file, or select several.
2. **Press `ctrl+t`.** The transfer tree opens at your home folder or the current
   folder (see settings).
3. **Browse to the destination** with `ctrl+←` / `ctrl+→`. `New Folder…` creates
   one and enters it.
4. **Press `Enter`.** On a folder row that targets the folder; on a file row it
   targets the folder you are viewing.
5. **Choose Copy or Move.** Large transfers show a progress bar, then the
   destination folder opens.

`Esc` (or Cancel Transfer) backs out and deselects.

You cannot copy a folder into itself, and moving files onto the folder they are
already in is refused with a message. Name clashes get a `copy` suffix; nothing
is overwritten.

## Paths from the clipboard

Select files in your file manager and copy them, then run **Transfer Clipboard
Paths**. It reads `text/uri-list` — what Nautilus, Dolphin, Thunar, HyprFM and
dfiles (Dux) all put there — as well as plain one-path-per-line text with `~`,
and the `x-special/gnome-copied-files` cut marker is ignored: Copy or Move stays
an explicit choice in the tree. Anything that
no longer exists, and drops you into the same transfer tree. No paths on the
clipboard means no transfer, with a Retry action.

## Other operations

In any row's action menu:

- **Rename…**, **Duplicate**
- **Compress to ZIP** (`ctrl+shift+z`) — single items and whole selections
- **Extract Here** on `.zip` files
- **Move to Trash** (`ctrl+backspace`, with confirmation) — through `gio trash`,
  so it can be undone from the file manager
- **New Folder… / New File…**, **Copy Path**, **Copy File Name**,
  **Show in File Manager**

## Keys

Bare `Space`, `Tab` and the arrow keys never reach an action: Vicinae gives them
to the list and the search field. Every action below therefore carries a
modifier.

| Action | Key |
| --- | --- |
| Enter a folder | `Enter`, `ctrl+→` |
| Open a file | `Enter` |
| Preview a file | `ctrl+Enter` |
| Go up | `ctrl+←`, `ctrl+[` |
| Transfer | `ctrl+t` |
| Show details | `ctrl+i` |
| Rename | `ctrl+r` (Vicinae's Refresh binding) |
| Duplicate | `ctrl+d` |
| Compress to ZIP | `ctrl+shift+z` |
| Move to Trash | `ctrl+backspace` |
| Select all / filtered / clear | `ctrl+shift+a` / `ctrl+shift+f` / `ctrl+shift+x` |
| Show in File Manager | `ctrl+o` (Vicinae's Open binding) |
| Copy path | `ctrl+shift+.` (Vicinae's CopyName binding) |
| Toggle hidden files | `ctrl+shift+p` (Vicinae's Pin binding) |
| New folder in the transfer tree | `ctrl+n` (Vicinae's New binding) |

The named bindings follow your Vicinae keybinds, not hard-coded keys.

## Settings

| Setting | What it does |
| --- | --- |
| Starting Folder | Where Browse Files opens (default: `~`) |
| On Open | Start in that folder, or resume the last opened one |
| Transfer Start Folder | Where the `Tab` tree begins: home folder or current folder |
| View Options | Show hidden files by default (`Toggle Hidden Files` still flips it) |

## Linux differences

| macOS | Here | Why |
| --- | --- | --- |
| `Transfer Finder Selection` | `Transfer Clipboard Paths` | No Linux file manager exposes another process its selection; a copy puts `text/uri-list` on the clipboard, which every one of them does |
| Quick Look (`Space` preview) | `ctrl+Enter` pushes a detail view; images, markdown and code render inline | `Action.ToggleQuickLook` is a no-op stub in `@vicinae/api`. A pushed view is real navigation, so `Esc` always works, unlike an external preview window |
| `showInFinder` | `showInFileBrowser` | Opens the default file manager at the item |
| Browsing `/Applications` for Open With | `getApplications(filePath)` | Desktop entries, not `.app` bundles; Vicinae already indexes them |
| `trash()` | `gio trash --` | The bundled `trash()` is `rm -r`: it cannot be undone |
| `ditto -c -k` / `ditto -x -k` | `zip -q -r -y` / `unzip -q -o` | `-y` stores symlinks instead of following them; running from the parent keeps a folder itself at the archive top level, so no staging copy |
| Finder favourites | `~/.config/user-dirs.dirs` | The folder names are localised, so `~/Downloads` may not exist |
| `cmd+…` shortcuts | `ctrl+…` | There is no Cmd key; domain verbs keep `ctrl` and the generic ones use Vicinae's named bindings |
| Shift+`↑`/`↓` selection runs | one row at a time | `List` has no `selectedItemId`: code cannot move the highlight |
