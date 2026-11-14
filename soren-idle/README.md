# Soren Idle

A sci-fi idle game: you crashed on an alien world, pick a task, leave it running,
come back to what it made.

Port of [mikael_brostrom/soren-idle](https://github.com/raycast/extensions/tree/main/extensions/soren-idle)
v1.1.0 (MIT), deployed nearly as written. One command, `Play Soren Idle`.

## Use

The menu lists the survivor, then the game: tasks per skill, inventory and gear,
the base and its buildings, hydroponics, bounties, trade and the voyage at the end
of a run. `Enter` on a task starts it; it runs while the window stays open, and the
action panel holds the rest.

Searching from the root looks through every task, item and building at once. The
bounty refresh uses Vicinae's named `Refresh` id, so keybinds drive it; buy and
sell use `ctrl+1`, `ctrl+shift+a` and `ctrl+shift+m`.

## Save

The save lives in Vicinae's `LocalStorage` (`soren-idle-save`) and advances once a
second while the window is open. Closing it stops the clock; the next launch
advances everything since the last tick, capped at 12 hours offline (`Stasis Pod`
adds hours). An unreadable save is kept as `soren-idle-save-corrupt` and a new game
starts, with a notice. **Settings → Copy Save / Import Save** moves a save between
machines.

Upstream's macOS menu-bar ticker is cut: Linux Vicinae has no menu-bar command, so
nothing runs while the window is closed and the offline catch-up covers it.

## Not verified

No screen was seen: the launcher cannot be captured on this machine. The window
loads and ticks. A real 12-hour gap was not waited out; a 33-second gap advanced
correctly on the next launch.
