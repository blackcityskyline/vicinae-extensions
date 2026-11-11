# Audit: `soren-idle` ← upstream deploy, with the Raycast differences patched

Upstream: [mikael_brostrom/soren-idle](https://github.com/raycast/extensions/tree/main/extensions/soren-idle)
v1.1.0, MIT. Snapshot taken from `main` on 2026-11-11: 108 TypeScript files, 784 KB of
`src/`, one `view` command (`play`) and one `menu-bar` command (`ticker`). The game
engine, its data tables and the ASCII HUD art are the author's; only the differences
below were edited.

The port is a deploy, not a rewrite: Vicinae resolves `@raycast/api` at runtime, so the
first attempt was upstream as-is with `platforms`, `author` and the scripts rewritten.
That failed in the type check, which is the point — the compiler found five shortcut
objects, two icon names and the `filtering` shape before a launch did. Imports were then
moved to `@vicinae/api` so later edits are checked against the API Vicinae actually
runs; `@raycast/utils` stays, as the porting notes require.

## What changed

| Change | Sites | Measurement |
| --- | --- | --- |
| `@raycast/api` → `@vicinae/api` imports | 21 files | `tsc` could not see `List.filtering: boolean` or the single-object shortcut while resolving Raycast's types |
| `Icon.Gear` → `Icon.Cog`, `Icon.Shield` → `Icon.Shield01` | 5 (`views/constants.ts` ×4, `views/equipment.tsx` ×1) | `icon.d.ts` in the resolved `@vicinae/api` 0.29.2: `Gear` and `Shield` are absent, `Cog` and `Shield01` are present. The other 40 icon names used exist |
| per-platform shortcut objects → one `{ modifiers, key }` | 5 (`views/inventory.tsx` ×1, `views/trade.tsx` ×4) | Vicinae's `Keyboard.Shortcut` has no `macOS`/`Windows` members. Kept upstream's keys as `ctrl`, which is what `cmd` means here |
| `filtering={{ keepSectionOrder: true }}` → `filtering` | 2 (`play.tsx`, `screens.tsx`) | Vicinae's prop is `boolean`; an explicit `true` is required in `play.tsx` because the `onSearchTextChange` handler would otherwise turn the builtin filter off |
| menu-bar ticker **cut** | `ticker.tsx`, `notify.ts`, `engine/notifications.ts`, the four notification toggles, the command and its preference | `vicinae cmd ls` lists only `@black/soren-idle:play`; `vicinae cmd launch '@black/soren-idle:ticker'` answers `Unknown command entrypoint`. A `menu-bar` command has no surface on Linux, so the background worker and its `osascript` notification have nothing to drive |

After the cut, three exports that only the ticker used were removed: `recordAway` and
`isQuiet` (the write side of `unseen`), `formatReport`, and the `notify*` settings from
`Settings`/`newGame`. `unseen` and `clearAway` stay: a save written by the ticker's
earlier build carries that field, and the first Play tick still folds it into the away
report.

No `SAVE_VERSION` bump: a removed settings key is not a shape change. Old saves keep
those keys in their `settings` record and no code reads them.

## Verified

```
npm run lint    ready - Manifest is valid
npm run check   clean (noUnusedLocals)
npm test        9 check(s) passed
npm run build   built extension successfully
```

`test/migrate.test.ts` covers the save contract against the steps in `engine/migrate.ts`:
v1 beacon → `contactAt` and the low-HP hint skipped; v2 owned gear worn; v3 engineering
XP carried to fabrication; all steps on a v1 save; a current save untouched; exported
text re-imported deep-equal; garbage and a newer version refused; a wrong-shaped record
named (`The save is damaged (xp)`). The test imports only the engine half — `migrate.ts`
does not reach `@vicinae/api`, so it runs under `tsx`.

Runtime, after `npm run build`:

- launch `@black/soren-idle:play` → `Loaded extension soren-idle:play` then
  `Started extension soren-idle:play`, no error in between.
- the save row appears in Vicinae's `storage_data_item` table, namespace
  `@black/soren-idle:data`, key `soren-idle-save`, version 5.
- with the window open, `lastTick` advanced 5,999 ms over 6 s of wall clock: the 1 s tick
  is running and writing.
- closing the window (launching another command) left `lastTick` unchanged for 30 s;
  reopening advanced it by 32,849 ms in one step. Offline catch-up works and nothing
  writes while the window is closed.

## Idle cost

The only command is a `view`. While no window is open the extension has no worker, no
timer and no interval; the launch above confirms it: no process, no save writes. With the
window open the game reads, advances and writes the save once a second, which is the
upstream design and the price of a live idle game. The menu-bar ticker — the one part
that would have run all day — is not ported.

## Not verified

- No screen was seen: the launcher layer is not capturable on this machine. That the
  window loads is from the log, that it ticks is from the save's `lastTick`.
- No action was pressed. Starting a task, crafting, fighting, trading, harvesting and
  importing a save are covered by the engine's own code and the migration checks only.
- The 12-hour offline cap and the away toast were not reached; the measured gap was 33
  seconds.
- Old saves in the wild with the ticker's `unseen` report were not replayed. The code
  path is present; no such save was available.
