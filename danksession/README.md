# DankSession

A Vicinae UI for [danksession](https://github.com/alcxyz/DankSession), the
Hyprland session-restore backend. The extension shells out to the `danksession`
CLI; it never talks to the compositor itself, so what it shows is exactly the
snapshot the backend wrote.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `Window Layout` (`status`) | view | Snapshot age and counts, one row per saved window, Save now, Preview restore, Restore |

## Actions

| Action | Key | Does |
| --- | --- | --- |
| Save Now | `ctrl+s` | `danksession capture`, then rereads the status |
| Preview Restore | `ctrl+shift+v` | `danksession restore --dry-run`; a toast reports matched/missing/launched and the first operations |
| Restore Layout | `ctrl+shift+s` | `danksession restore` after a confirmation; moves open windows and relaunches configured applications |
| Refresh | `ctrl+r` | Rereads `danksession status` |
| Copy State Path | `ctrl+shift+,` | Copies the state file path from the Backend section |

Rows show the application, saved workspace and size, and whether the window is
`Placement only` or `Relaunch`able. `managed` in the backend counts the windows
that have a launch rule, so `Placement only` is the normal state until
`~/.config/danksession/config.json` lists the application.

## Requirements

- `danksession` on `PATH` or in `~/.local/bin`, or its path in the extension
  preferences. There is no distro package: build it from source
  (`go build -o ~/.local/bin/danksession ./cmd/danksession`).
- Hyprland for `capture` and `restore`; both read `HYPRLAND_INSTANCE_SIGNATURE`
  from the environment. `status` reads the saved file and works without it.
- State in `~/.local/state/danksession/last.json` (`0600`), config in
  `~/.config/danksession/config.json`. Relaunches need `systemd-run`
  (systemd 254 or newer).

The daemon (`danksession daemon`) is a separate systemd user service. This
extension does not start it, so auto capture and auto restore stay off until
that service is installed.

## Deliberate limits

- Only what a keyboard-driven view needs: `configure` flags, exclusion rules and
  the daemon are left to `config.json` and the DankMaterialShell widget.
- No `--no-launch`: the extension either previews or restores fully.

## What leaves the machine

Nothing. Every call is the local binary reading local files; there are no
network requests.

## Verified live

2026-11-15, danksession v0.3.6 (`dev-7cd651479853`, built from source) on
Hyprland 0.56.2:

- Save Now wrote three windows and the list changed to
  `Saved just now · 3 windows · 3 workspaces · auto capture every 15 s`, with
  rows `ai.opencode.desktop`, `zen` and `mpv`, each `Placement only`.
- Preview Restore toasted `3 matched` and left the state file's mtime unchanged.
- A missing binary renders `Cannot read the danksession state` with the install
  hint instead of an empty view.
- Not pressed: Restore Layout (it moves the open windows; the dry run above
  covers the same command) and Copy State Path.
