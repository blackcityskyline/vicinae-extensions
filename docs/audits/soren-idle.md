# Audit: `soren-idle` ← upstream deploy

Upstream: [mikael_brostrom/soren-idle](https://github.com/raycast/extensions/tree/main/extensions/soren-idle)
v1.1.0, MIT, snapshot from `main` on 2026-11-11: 108 TypeScript files, 784 KB of
`src/`, one `view` command (`play`) and one `menu-bar` command (`ticker`). The
engine, its data tables and the ASCII art are the author's.

A deploy, not a rewrite: `platforms`, `author` and the scripts were rewritten,
then where the type check failed the code was patched against `@vicinae/api`
(`@raycast/utils` stays, as the porting notes require).

## What changed

| Change | Sites | Measurement |
| --- | --- | --- |
| `@raycast/api` → `@vicinae/api` imports | 21 files | `tsc` could not see `List.filtering: boolean` or the single-object shortcut while resolving Raycast's types |
| `Icon.Gear` → `Icon.Cog`, `Icon.Shield` → `Icon.Shield01` | 5 (`views/constants.ts` ×4, `views/equipment.tsx` ×1) | `icon.d.ts` in `@vicinae/api` 0.29.2: `Gear` and `Shield` are absent, `Cog` and `Shield01` present. The other 40 icon names used exist |
| per-platform shortcut objects → one `{ modifiers, key }` | 5 (`views/inventory.tsx` ×1, `views/trade.tsx` ×4) | `Keyboard.Shortcut` has no `macOS`/`Windows` members. Upstream's keys are kept as `ctrl`, which is what `cmd` means here |
| `filtering={{ keepSectionOrder: true }}` → `filtering` | 2 (`play.tsx`, `screens.tsx`) | the prop is `boolean`; `play.tsx` needs an explicit `true` or `onSearchTextChange` turns the builtin filter off |
| menu-bar ticker **cut** | `ticker.tsx`, `notify.ts`, `engine/notifications.ts`, four notification toggles, the command and its preference | `vicinae cmd ls` lists only `@black/soren-idle:play`; `vicinae cmd launch '@black/soren-idle:ticker'` answers `Unknown command entrypoint`. No menu-bar surface on Linux, so the worker and its `osascript` notification have nothing to drive |

Three exports only the ticker used were removed (`recordAway`, `isQuiet`,
`formatReport` and the `notify*` settings); `unseen` and `clearAway` stay, since a
save from the earlier build carries that field. No `SAVE_VERSION` bump: a removed
settings key is not a shape change, and nothing reads it.

## Verified

```
npm run lint    ready - Manifest is valid
npm run check   clean (noUnusedLocals)
npm test        9 check(s) passed
npm run build   built extension successfully
```

`test/migrate.test.ts` covers the save contract against `engine/migrate.ts`: v1
beacon → `contactAt` and the low-HP hint skipped; v2 owned gear worn; v3
engineering XP carried to fabrication; all steps on a v1 save; a current save
untouched; exported text re-imported deep-equal; garbage and a newer version
refused; a wrong-shaped record named (`The save is damaged (xp)`).

Runtime, after `npm run build`:

- `@black/soren-idle:play` → `Loaded extension soren-idle:play` then `Started
  extension soren-idle:play`, no error between.
- the save row appears in `storage_data_item`, namespace `@black/soren-idle:data`,
  key `soren-idle-save`, version 5.
- with the window open, `lastTick` advanced 5,999 ms over 6 s: the 1 s tick runs
  and writes.
- closing the window left `lastTick` unchanged for 30 s; reopening advanced it by
  32,849 ms in one step. Nothing writes while the window is closed.

## Idle cost

While no window is open there is no worker, timer or interval — confirmed by the
launch above: no process, no save writes. With the window open the save is read,
advanced and written once a second, which is upstream's design. The ticker, the
one part that would have run all day, is not ported.

## Not verified

- No screen was seen: the launcher layer is not capturable here. That the window
  loads is from the log, that it ticks is from `lastTick`.
- No action was pressed; tasks, crafting, fighting, trade, harvest and import are
  covered by the engine's code and the migration checks only.
- The 12-hour offline cap and the away toast were not reached; the measured gap
  was 33 seconds.
- Saves carrying the ticker's `unseen` report were not replayed; the code path
  exists, no such save was available.
