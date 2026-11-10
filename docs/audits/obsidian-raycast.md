# Audit: Raycast Obsidian → Vicinae

Fork of [`raycast/extensions/extensions/obsidian`](https://github.com/raycast/extensions/tree/f1a99ca99ad516843787a211e78e160388c5b9f5/extensions/obsidian)
at commit `f1a99ca`, deployed as is and patched only where it failed here. Every
number below was measured.

## Scale

| | Upstream | Port |
| --- | --- | --- |
| Commands | 13 | 12 |
| Runtime dependencies | 9 | 9 |
| Lines of app code | 6 080 | 6 080 |
| Source files | 93 | 86 |
| Metadata screenshots | 10 (20 MB) | 0 |
| Test files / tests | 25 / 380 | 25 / 380 |

The code ran without a port: the only changes are the manifest, two icon names,
one dead preference, platform wording and the macOS-only caret jump. Everything
else is upstream's, including the tests, which run unchanged and pass on Linux.

## What was cut

- **Obsidian Menu Bar** (`obsidianMenuBar.tsx`, `MenuBarExtra`): Vicinae has no
  menu-bar surface. The command and its file are gone; 12 commands remain.
- **AI tools** (`src/tools/*`, `ai.json`): Raycast AI function-calling, with no
  runtime in Vicinae and no callers in the extension itself.
- **Store metadata and screenshots** (`metadata/`, 20 MB), Raycast lint/prettier
  config, `CHANGELOG`, `CONTRIBUTING`, `DOCUMENTATION`, `REFERENCE`: store
  paperwork, not code.

## Manifest

- `platforms` `["macOS", "Windows"]` → `["Linux"]`, author and scripts rewritten,
  `$schema`, `engines` and the `tools` block dropped, icon moved to the root.
- Dropdown preferences used `defaultValue`; Vicinae reads `default`. Converted on
  both global and per-command preferences.
- `removeLatex` and `removeLinks` had `title: null`; `vici lint` requires a title,
  so they take their labels.
- `fuzzySearch` was declared for Search Note and Bookmarked Notes but never read:
  name search always goes through Fuse.js. The dead preference is removed.

## Linux changes

- `Icon.ExclamationMark` and `Icon.TextDocument` do not exist in the Vicinae icon
  set; they are `Icon.Exclamationmark` and `Icon.Text` here.
- "Show in Finder" is "Show in File Manager", and the CLI error no longer tells
  the user to restart Raycast.
- **Caret jump**: "Open Match in Obsidian" positions the caret by driving the
  Obsidian CLI, which ships inside the macOS app bundle and connects over
  `${XDG_RUNTIME_DIR}/.obsidian-cli.sock` where it exists. This machine's
  `/usr/bin/obsidian` is the distro's Electron wrapper, which launches the GUI
  with the arguments instead of acting as the CLI, and no socket is present. On
  anything but macOS the action now opens the note through `obsidian://` and
  closes the window, instead of hanging 15 s on a command that is not there and
  raising a failure toast.
- Vault discovery already handles Linux: `$XDG_CONFIG_HOME/obsidian/obsidian.json`
  (six vaults here), and the URL scheme is registered by the distro's desktop
  file (`x-scheme-handler/obsidian`), so open-in-Obsidian works through `open()`.

## Verification

- `npm run build`: 12 entrypoints bundled, type check clean.
- `npm test`: 25 files, 380 tests, 12–13 s, all passing on Linux.
- Launched `searchNoteCommand`, `openVaultCommand`, `createNoteCommand`,
  `dailyNoteCommand`, `quickCaptureCommand` and read the screenshots with OCR:
  the six real vaults are listed, the create/search flows show the vault picker,
  Quick Capture renders its form, and Daily Note correctly reports the missing
  Advanced URI / Daily Notes plugins. No error, exception or worker crash in
  `vicinae logs` with the extension loaded.

## Not verified

- The note list after choosing a vault, the actions beyond opening (copy, paste,
  append, delete, bookmarks) and the media grid: the launcher is driven by hand,
  so these were not pressed.
- The macOS caret jump, which cannot run here.
