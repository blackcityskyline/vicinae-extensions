# Soren Idle

A sci-fi idle game. You crashed on an alien world; pick a task, leave it running, come
back to what it made.

Port of [mikael_brostrom/soren-idle](https://github.com/raycast/extensions/tree/main/extensions/soren-idle)
v1.1.0 (MIT), deployed nearly as written: 105 source files in `src/`, no code changed
except the Raycast-to-Vicinae differences in `docs/audits/soren-idle.md`. One command,
`Play Soren Idle`.

## Use

The menu lists the survivor, then the game: tasks per skill, inventory and gear, the
base and its buildings, hydroponics, bounties, trade and the voyage at the end of a run.
`Enter` on a task starts it; the task keeps running while the window stays open, and the
action panel holds everything else.

Searching from the root list looks through every task, item and building at once. The
same rows, with their actions, are grouped by skill on the pushed screens.

The only shortcut upstream gave a generic verb is the bounty refresh, which uses Vicinae's
named `Refresh` id so your `keybinds` drive it. The sell/buy actions use `ctrl+…`
(`ctrl+1`, `ctrl+shift+a`, `ctrl+shift+m`). Everything else is reached with `Enter` or
the action panel.

## Progress and saves

The game holds your save in Vicinae's `LocalStorage` (key `soren-idle-save`, namespace of
this extension). While the window is open it advances once a second. Closing the window
stops the clock; the next launch advances everything since the last tick, capped at 12
hours of offline time (the Stasis Pod adds offline hours). A save that cannot be read is
kept under `soren-idle-save-corrupt` and a new game starts; a notice says so.

Upstream also shipped a macOS menu-bar ticker that advanced the game in the background
and sent notifications. Linux Vicinae has no menu-bar command surface, so it is cut
entirely — no background worker, no timer, nothing running while the window is closed.
The offline catch-up keeps the same result. **Settings → Copy Save / Import Save** moves
a save between machines as text.

## Not verified

- The launcher layer cannot be captured on this machine, so no screen was seen. The
  window loads and ticks; actions were not pressed.
- A real 12-hour offline gap was not waited out. A 33-second gap was measured: nothing
  is written while closed, then one advance of the full gap on the next launch.
- The menu-bar ticker is not ported, so the notification preferences it used are gone.
  Old saves that still carry those keys ignore them.
