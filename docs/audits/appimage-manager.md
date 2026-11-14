# appimage-manager — Omarchy plugin, bash backend

Source: `bmaltais/StartAppImage` v1.0.5 (commit `058acb2`, 2026-10-16), MIT. An **Omarchy plugin**, not a
Raycast extension: 11 QML files (2 979 lines) for the window and the bar widget, plus `bin/startappimage`, a
self-contained 886-line bash CLI, and `tests/cli.sh` (510 lines).

The QML cannot be reused. The bash script is the extension's entire backend — metadata, install, adoption,
updates, uninstall — and it runs outside Omarchy. Measured on 2026-11-13, with `HOME` pointed at a scratch
directory so nothing in the real home was created.

## What is here

| Needed | Found | Note |
| --- | --- | --- |
| `omarchy`, `omarchy-shell`, `omarchy-shell-config` | **missing** | `/usr/share/omarchy` does not exist. This is plain Arch + Hyprland, not Omarchy |
| `unsquashfs`, `mksquashfs` | **missing** | `squashfs-tools 4.7.5-1` is in `extra`, not installed. `info` and `add` die without it |
| `jq` | 1.8.2 | every JSON command |
| `curl` | present | downloads, GitHub API |
| `7z` | 26.06 | reads the AppImage's squashfs payload; a spare reader, see below |
| `bash` | 5.3.20 | the script needs 5.x (`${x,,}`, `printf -v`-free but `$'\n'`, `trap RETURN`) |
| `xdg-mime`, `update-desktop-database`, `notify-send` | present | handler switching, launcher cache, toasts |
| `startappimage` on `PATH` | **missing** | nothing installed the CLI |

The plugin's own `tests/cli.sh` here: **29 passed, 26 failed**. All 26 are fixtures that cannot be built without
`mksquashfs` (`mksquashfs: command not found`, then `not installed: demo-app`); no assertion failed on code that
did run.

## What the CLI answers

Run from a copy under `/tmp`, with `HOME`/`XDG_*` redirected to a scratch home holding a copy of the one real
desktop entry:

| Command | Measured |
| --- | --- |
| `list --json` | 51–58 ms; adopts the AppImageLauncher entry: `id omniroute-3.8.52`, `external true`, `version 3.8.52` from `X-AppImage-Version`, `exec /home/black/apps/OmniRoute_….AppImage` |
| `config <id>` | 58 ms after the manifest exists; `args "--no-sandbox"` parsed out of `Exec=`, `sourceKind external`, `repo ""` |
| `locations` | 45 ms; `default ~/.local/share/appimages`, plus `/home/black/apps` with 1 app |
| `integration` | 80 ms; `handler.current appimagelauncher.desktop`, `name AppImageLauncher`, `cli.state none`, `checkHours 6`, `done false` |
| `resolve github:localsend/localsend` | 387 ms; `ok true`, `tag v1.18.2`, asset `LocalSend-1.18.2-linux-x86-64.AppImage` — the x86_64 pick from four assets |
| `resolve github:bmaltais/StartAppImage` | `ok false`, `kind noasset` — its own release has no AppImage |
| `resolve not-a-repo`, `github:owner/does-not-exist-xyz` | `kind invalid` / `kind notfound`, both with a sentence to show |
| `check --json` on an adopted app | `[]` — external apps are skipped until a source is set |
| `check --json` after `set --source github:localsend/localsend` | `[{"id":"omniroute-3.8.52","current":"3.8.52","latest":"v1.18.2"}]`, and the count `1` lands in `~/.cache/startappimage/updates` |
| `folder '~/Pictures'` | `ok true`, expanded; `folder /etc` → `ok false`, "The folder must be inside your home directory." |
| `info <real AppImage>` | `startappimage: missing dependency: unsquashfs`, exit 1 |

`add </file>` needs `unsquashfs` for the same reason, so **install and metadata preview cannot be exercised here
until `squashfs-tools` is installed**. The offset arithmetic was verified by hand on the real 405 MB AppImage:
`shoff 186344 + 64 × 32 = 188392`, and bytes 188393–188396 are `hsqs`. `7z e` reads that payload directly —
`.desktop` plus the 512 px icon in **83 ms** — so `unsquashfs` is a convenience, not the only reader; `bsdtar`
refuses the file ("Unrecognized archive format").

The destructive paths were not run: no `.AppImage` is created, downloaded 100 MB, or deleted here. The refusal
guard was measured instead — removing the adopted app from the scratch home prints
`refusing to remove /home/black/apps/OmniRoute_….AppImage` and exits 1 with the file untouched, because it is
outside that `$HOME`.

## What dies with Omarchy

| Piece | Why it cannot survive |
| --- | --- |
| 2 979 lines of QML | Vicinae renders lists, grids and forms; there is no window to place or resize |
| `ui`, `open`, `setup`, `register`, `unregister` | `ui` calls `omarchy-shell`, `open` shows the QML card and falls back to `walker`/`fuzzel`/`wofi`/`rofi`, none of which exist here; the rest write Omarchy's launcher entry, hidden file handler and `~/.local/bin` link |
| `window`, bar icon, `setup --bar-icon` | window geometry and `omarchy-shell-config`; a Vicinae command is not a bar widget |
| the 6-hour `Timer` and the 20 s startup `Timer` in `Service.qml` | a launcher extension must not spin: update checks become an action |
| `notify-send -A` with its two buttons | the notification has no owner on this machine (`org.freedesktop.Notifications` is unowned), and Vicinae has its own toasts |

## What the port is

Vendor `bin/startappimage` into `assets/` and drive it — `vici build` copies `assets/` recursively
(`node_modules/@vicinae/api/dist/commands/build/index.js:118-120`), so one `cpSync` ships the script, and the
extension calls `bash <environment.assetsPath>/startappimage …` with `--json`. Re-implementing 886 lines of
measured bash in TypeScript would be a second implementation of the same rules with none of the coverage.

- **Manage AppImages** (view) — `List` from `list --json`: icon, name, version, an `EXTERNAL` tag for adopted
  apps. Actions `Open` (launch the `.desktop` already pointing at the file), `Check for Updates`
  (`check --json`), `Update` / `Update All` (`update`), `Uninstall` (`remove`, destructive, one confirmation),
  `Settings` (push), `Install AppImage…`, `Refresh`.
- **Install AppImage** (view) — a `Form`: source (file picker, download URL, `github:owner/repo` or a GitHub
  link), optional name, folder from `locations`. `resolve` validates a GitHub source on submit, `add --json`
  installs, and `{ok:false, field, error}` maps back onto the field.
- Per-app settings: a pushed `Form` over `config`/`set --json` with name, launch arguments, update source
  (validated by `resolve`), the folder (`folder` checks it), and the launcher visibility checkbox.

## Traps

- **Opening the list writes to the home folder.** `list` calls `sync_external`, which adopts every
  `~/.local/share/applications/*.desktop` whose `Exec` runs an `.AppImage` and writes
  `~/.local/share/startappimage/<id>.env`. That is the adoption mechanism, but a read-only-looking command is not
  read-only.
- **Uninstalling an adopted app deletes the file**, not just the manifest.
- The manifest id is a slug of the **name**: `OmniRoute (3.8.52)` → `omniroute-3.8.52`. Versions inside names
  survive because adoption de-duplicates by resolved path, not by id.
- `--dir` outside `$HOME` is refused by both `add` and `set`, and `~` is expanded by the script — the
  Vicinae-side `expandHome()` rule from wallhaven applies to any path we pass ourselves.
- `find_icon` searches `~/.local/share/icons` and `~/.local/share/pixmaps` only. Run by hand for the adopted
  app, the exact `find` returns `hicolor/512x512/apps/appimagekit_…_omniroute-desktop.png`; the scratch home had
  no icons, so the icon path was proven as a command, not as a rendered row. An icon only in `/usr/share/icons`
  would not be found.
- `info` copies the extracted icon to `~/.cache/startappimage/preview-<pid>.<ext>` and never removes it.
- The current `.AppImage` handler is `appimagelauncher.desktop`, registered in
  `~/.local/share/applications/mimeinfo.cache`, and **its `AppImageLauncher` binary is missing**.
  `app-handler.desktop` points at a missing `/opt/better-github` too, so double-clicking an `.AppImage` here opens
  nothing.

## Live launch

Both commands installed and launched through `vicinae://launch/@black/appimage-manager/…`.

- `manage-appimages` listed the adopted app within 1 s on every launch except the first load after install: row
  `OmniRoute (3.8.52)`, subtitle `3.8.52 · Added by another launcher`, tag `External`. A real adoption, not a
  fixture — the CLI wrote `~/.local/share/startappimage/omniroute-3.8.52.env` in the real home. Deleting that
  file and relaunching reproduced it.
- The App Settings form showed Name `OmniRoute (3.8.52)`, Launch Options `--no-sandbox`, Update Source empty with
  its placeholder, App Launcher checked, Location `~/apps`, and the image path underneath.
- Uninstall opened a dialog naming the file it would delete; Escape cancelled it and the file and its `.desktop`
  entry were unchanged afterwards.
- The Install form defaulted to `~/.local/share/appimages (0)`; its actions panel read `App Settings ctrl+e`,
  `Uninstall ctrl+d`, `Install AppImage… ctrl+n`, `Refresh ctrl+r`.
- `stderr` stayed empty; the only log line after a command is the ordinary `Worker … exited with code 1`.

That run caught two bugs the CLI checks could not: fields mounted against an empty form showed blank settings
(`defaultValue` is read once at mount, so the forms now return `<Form isLoading />` until the data arrives), and
the settings form's `info` texts ran past the 508 px window, so they were shortened.

## Not verified

- **Typing into a form.** `Tab` does not move focus between Vicinae's form fields and no mouse driver is available
  here, so no field could be filled and neither submit was pressed: install and save are covered by the CLI checks
  and by reading the code, not by a keystroke. The uninstall dialog's confirm button is likewise unpressed — only
  Escape was tried.
- **Install, update and uninstall end to end.** Blocked by the missing `unsquashfs`: `add` copies the file first
  and dies in `extract_meta`.
- **The icon extraction from a real image** — `7z` proved the payload is readable and the `.desktop` is where the
  script looks for it, but `extract_meta`'s own `unsquashfs` call never ran.
- **The QML window, the bar icon, the notification buttons.** Omarchy-only, dropped.
