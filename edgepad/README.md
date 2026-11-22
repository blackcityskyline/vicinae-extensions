# Edgepad

Browse and edit [edgepad](https://github.com/assembledev/edgepad) touchpad edge
gestures from the launcher, without hand-editing TOML.

| Command | Does |
| --- | --- |
| Gestures | every gesture and slider of the selected config, grouped by edge; add, edit, delete, run an action once |
| Create Gesture | the add-gesture form straight away |
| Config Settings | device, edge widths, tap/swipe timing, block-while-typing, niceness |
| Health Check | `edgepad status` and `doctor` as a checklist, touchpads, service control, logs |
| CLI | `dump`, `proxy`, `replay`, `replay-raw`, foreground `daemon` and the remaining service verbs |

Configs are listed in the search-bar dropdown; the session's file
(`hypr-edgepad.toml` on Hyprland, per the `edgepad-session` wrapper) is tagged,
and the last selected one is remembered.

## Writes go through edgepad

A save never replaces the config blindly: the new text goes to a sibling temp
file, `edgepad status --config <tmp>` validates it, and only a `Config` line
naming the temp file is accepted — anything else surfaces edgepad's own parse
error and the original file stays untouched. Only then is the temp file renamed
over the real one.

The file is edited as text, not re-serialised: comments, blank lines, key order
and unknown tables survive a save; only the edited block changes.

After a save the service is asked to reload. Changing the device or any
`block_while_typing_*` setting restarts it instead — edgepad spawns that guard
once at startup and ignores those keys on reload.

## Keys

Rows: `ctrl+e` edit, `ctrl+x` delete, `ctrl+o` run the action now (or open),
`ctrl+shift+c` copy the command. Panels: `ctrl+n` add gesture,
`ctrl+shift+s` add slider, `ctrl+r` refresh, `ctrl+shift+r` reload the service,
`ctrl+k` switch config, `ctrl+shift+h` health check, `ctrl+shift+d` copy
diagnostics. Service lifecycle in the config row: `ctrl+shift+alt+s` start,
`ctrl+shift+alt+x` stop, `ctrl+shift+alt+r` restart.

## Preferences

- **Edgepad Binary** — absolute path; empty means the first `edgepad` on `PATH`.
- **Config Directory** — defaults to `$XDG_CONFIG_HOME/edgepad`, then
  `~/.config/edgepad`.
- **Service Unit** — `edgepad.service` by default; reload is `systemctl --user
  reload`, which the session wrapper forwards to the daemon as `SIGUSR1`.

## Not verified

All five commands load and start in Vicinae. The save path was exercised
headlessly against the real binary: a valid edit was written and reloaded; an
invalid one (`edge_width = 2`) was rejected with edgepad's own message, the file
staying byte-identical. Forms and action panels were not clicked through by
hand.

## Notes for the next reader

- `edgepad status` exits 2 for a `Config` line that names a parse failure, so the
  exit code alone is not a validation result: the `Config` line is.
- A slider edge cannot also carry a directional swipe; `zone = "pad"` supports
  only `tap` and `double-tap` — the forms reject both before saving.
- Commands are stored as argv arrays: the form's command field is split like a
  shell, but nothing is executed through one; quotes group words and `$VAR`
  stays literal.
