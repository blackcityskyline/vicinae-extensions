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
| Refresh | `ctrl+r` | Rereads `danksession status` and the service state |
| Copy State Path | `ctrl+shift+,` | Copies the state file path from the Backend section |
| Enable and Start Service | `ctrl+shift+p` | `systemctl --user enable --now danksession.service` when the unit is stopped and not enabled |
| Start Service / Start Once | `ctrl+shift+p` / `ctrl+shift+o` | Starts the enabled unit, or starts it for this session only |
| Restart Service | `ctrl+shift+r` | `systemctl --user restart danksession.service` |
| Stop Service | `ctrl+shift+x` | `systemctl --user stop danksession.service` |
| Enable / Disable at Login | `ctrl+shift+l` / `ctrl+shift+d` | Enables or disables the unit without starting or stopping it |
| Open systemd User Folder | `ctrl+shift+f` | Shown when the unit is not installed, so the service file is one step away |

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

The daemon (`danksession daemon`) is a separate systemd user service named
`danksession.service`. The extension reads its state with `systemctl --user show`
and starts, stops, restarts, enables and disables it from the Service section of
the action panel. A stopped, not-enabled unit shows **Enable and Start Service**
instead of only an error. The unit itself is not created by the extension:

```ini
# ~/.config/systemd/user/danksession.service
[Unit]
Description=Capture and restore the DankSession desktop state
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=%h/.local/bin/danksession daemon
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
```

## Deliberate limits

- Only what a keyboard-driven view needs: `configure` flags and exclusion rules
  are left to `config.json` and the DankMaterialShell widget. The service is
  managed here, but its unit file is not installed.
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

2026-11-21, danksession v0.3.6 (`dev-e367f94b3b95`) on Hyprland 0.56.2, with
`danksession.service` disabled and stopped:

- The Daemon row said `Not running — the service is not enabled at login` and
  the Service section offered `Enable and Start Service`. Running it enabled
  and started the unit; the row changed to `danksession daemon is capturing
  events` and the toast said `Service enabled and started`, without a manual
  refresh.
- `systemctl --user is-enabled` / `is-active` reported `enabled` / `active`
  afterwards. Stop, Restart and Disable at Login were not pressed.
