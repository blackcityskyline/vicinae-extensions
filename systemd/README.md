# Systemd

List and control systemd units — system and user alike — and read their logs,
without leaving the launcher.

| Command | Does |
| --- | --- |
| Services | every `.service` unit on both managers; start, stop, restart, reload, enable, disable; details with PID, start time, CPU, I/O, cgroup and the last 50 log lines |

Fork of [knoopx/vicinae-extensions] `extensions/systemd` (MIT). See **What
changed** for the diff and **Root actions** for the pkexec part.

## Root actions

Actions on **system** units need authorization. Two backends, picked in the
extension preferences:

- **Polkit (default)** — `systemctl start nginx.service`. systemd's D-Bus call
  goes through polkit, so the desktop's authentication agent asks for the
  password. This is what `systemctl` does in a terminal.
- **pkexec** — `pkexec systemctl start nginx.service`. Same polkit check, but
  the process runs as root. Useful where a rule or a hardened system rejects
  the direct call.

Neither can prompt without a **polkit authentication agent** running in the
session. On Hyprland that is `hyprpolkitagent` or
`polkit-gnome-authentication-agent-1`; desktop shells often carry their own
(DankMaterialShell's is inside `qs`, so `ps | grep polkit` does not show it —
polkitd spawns its `polkit-agent-helper` with the agent as parent). Without one,
the action fails with an error toast that says so — there is no terminal for
pkexec's own text agent to talk to, so a missing agent cannot be worked around
from inside the extension.

`pkexec` is never used for `--user` units: it drops
`DBUS_SESSION_BUS_ADDRESS`, and root cannot talk to the user manager.

## Keys

| Action | Key |
| --- | --- |
| Details | `ctrl+o` |
| Start / stop | `ctrl+s` |
| Restart | `ctrl+shift+r` |
| Reload | `ctrl+l` |
| Enable | `ctrl+e` |
| Disable | `ctrl+d` |
| Refresh (empty views) | `ctrl+r` |

## What changed from upstream

- Actions run through `execFile` with an argv array. Upstream built an `exec`
  shell string, so a unit name was shell syntax.
- `pkexec` backend added; the preference above chooses it.
- `x11` and the ESLint toolchain dropped — neither was imported or run here.
- `@vicinae/api` 0.29 icons (`Cog`, `BulletPoints`) replace the 0.22 names the
  store build used.
- Failed actions and failed log reads carry the tool's own message plus the
  next step, instead of only a toast title.
- Empty filter results explain themselves.

No polling: units are listed once per launch over D-Bus, both buses are
disconnected afterwards, and every action refreshes the list once.

## Not verified

The list and detail views were not clicked through by hand. `npm test` covers
the argv builder, failure classification and unit parsing.

The root path was measured with `polkit.service`, without touching anything the
machine depends on:

- `pkexec systemctl reload polkit.service` → exit 0 after the agent's password
  dialog, `polkit.service` still active.
- plain `systemctl reload polkit.service` reaches the same dialog; the run above
  failed only because the dialog was left unanswered past polkitd's ~25 s limit
  (`pam_unix(polkit-1:auth): conversation failed`).

Start, stop and disable were not clicked, because they change system state.

Requires only what systemd already provides: `systemctl`, `journalctl`, D-Bus
and polkit (for `pkexec`).

[knoopx/vicinae-extensions]: https://github.com/knoopx/vicinae-extensions
