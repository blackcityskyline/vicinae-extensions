# in-the-time-zone, measured

The upstream renderer port (`timeline-renderer.ts` + `palette.ts`) and its live
behaviour in Vicinae, measured on 2026-11-12/13. Upstream source read at
`i_idz/raycast-extensions`, commit `21bb8f97`, sparse-cloned to
`/tmp/opencode/raycast-ext/extensions/in-the-time-zone/`.

## Why the old timeline was replaced

The port's original timeline was ASCII drawn as a markdown code block: emoji
squares as hour cells, a `▼ NOW ▼` marker, columns aligned by hand. Upstream
draws one SVG image instead — a row of 24 rounded hour cells per city with the
hour number inside each cell, GMT/delta/Local badges, sun icons, a green
now-line and a red cursor-line, and a legend. The ASCII version was judged
unfit next to it and replaced by a port of the real renderer.

## The port

- `src/utils/palette.ts` — verbatim copy of upstream's `palette.ts` (band colours,
  `getHourType`: sleep 22–6, work 9–17, marginal else).
- `src/utils/svg-timeline.ts` — port of upstream's `timeline-renderer.ts`. The
  only structural change is luxon: everything the renderer asked of a
  `DateTime` is answered by `Intl` through `utils/time`, and instants move as
  plain milliseconds. The SVG markup (stylesheet with class selectors, text
  positioning, the cursor-label placement, the hand-rolled cell clipping) is
  upstream's, including its workarounds for renderers that ignore
  `font-weight` in stylesheets or paint `<clipPath>` as a black box.
- `src/in-the-time-zone.tsx` — `Detail` renders **one** full-width SVG data-URI.
  No metadata pane. The list view, storage format and shortcut style are the
  port's own and were kept.
- New preferences, matching upstream: `timeFormat`, `showLocalTimezone`
  (Local row), `cityOrder` (sort by GMT offset; `custom` keeps the saved
  order). Upstream's Move Up/Down actions and its "Remove City" guard for the
  local city were **not** ported — the list has no reorder UI without them, and
  the Local row is never saved anyway.

## What was verified live in Vicinae

Screenshots (`grim` on the launcher layer), OCR (`tesseract`) and pixel masks.
Screen colours are warm-shifted by night light: work `#e9b12f` reads as
(233,131,22), sleep `#313b8f` as (49,44,68) — hue-based masks, not RGB.

| Check | Result |
| --- | --- |
| SVG data-URI in `Detail` markdown (probe with upstream's own SVG, then the port) | renders: `<style>` classes, `text-anchor`, bold as `font-weight` attribute, `rotate` transforms |
| Timeline content | title date, one row per city, 24 cells, badges, sun icons, legend, Local badge — all OCR-visible |
| Now-line | one tall greenish column at the computed x (162 px) at 23:55 — present |
| `Alt+→` scrub +30 min | date rolls over, red cursor line at the expected x (pixel count 173 at x≈404), cursor label reads the scrubbed time |
| `Ctrl+N` | cursor line and label gone |
| `Shift+→` / `Shift+Alt+→` | snap to the next hour / half-hour boundary (cursor label read the snapped time) |
| `Ctrl+E` / `Ctrl+L` | list ↔ timeline |
| `Ctrl+0` | base becomes the bare system zone, subtitle `System timezone`, Local row gone |
| `Ctrl+I` | re-pins a city as base (storage confirmed in the DB) |
| Persistence | saved cities and base survive restarts |

Live finding: **bare `←`/`→` with `modifiers: []` never reach the actions**
(confirmed twice, nothing moved). Upstream scrubs with bare arrows; in Vicinae
the user scrubs with `Alt+←/→` and snaps with `Shift+←/→`. The actions keep
those bindings; the README's keys table names them.

## Two crashes found and fixed while probing

1. `sunKey` joined city ids with `|` — but city ids *contain* `|`
   (`zone|city|lat|lng`), so the key split into garbage and an `Intl.DateTimeFormat`
   call got a torn id: `RangeError: Invalid time zone specified:`. Separators are
   now `\u0001`/`\u0002`, which an id can never hold (visible in the bundle as
   raw `\x01`/`\x02`, not as `u0001`).
2. Before the saved cities load, `timelineZones` is empty → `sunKey === ""` →
   one phantom entry with an empty id → the same `RangeError`. The memo now
   returns `{}` for an empty key.

Both reproduce as a crash screen; both fixed and re-verified live.

## The pane is 200 px tall, so the layout is compact

Vicinae caps a markdown image's height in a `Detail` pane — `MdImage.qml`:

```qml
readonly property int imgH: root.maxImageHeight > 0 ? Math.min(_rawH, 200, root.maxImageHeight) : Math.min(_rawH, 200)
```

Measured, not guessed: a 792×476 probe image renders 332×200 at the same spot
as the timeline, and doubling the SVG's intrinsic width and height changes
nothing, because the 200 px cap decides the scale. The pane is 728 px wide
(content minus padding), so the original 792×476 drawing — which upstream's
Raycast screenshots show at full width — can only appear at 42 %.

The renderer is therefore drawn at **728×200**, in screen pixels, 1:1: 24 cells
of 29 px, six rows of 29 px (10 px header baseline, 15 px cells), fonts 5.5–11 px.
That fills the width; the original's taller rows are not attainable in Vicinae
0.30 without patching the launcher.

The caption under the image in the original screenshots was the markdown alt
text (`![Timeline](…)`), which Vicinae draws in italic below the image — the
markdown is `![](…)` with an empty alt now.

## Numbers

- 44 checks over four test files, 0 FAIL; `npm run lint`, `npm run check`,
  `npm run build` green. The renderer test pins 16 properties of one SVG
  against the reference instant `2026-04-09T01:39:00Z` (upstream screenshots'
  instant, Kolkata base): cell colours per upstream bands, the bold cursor hour
  in each row's own local grid, GMT/delta badges, day-diff, Local badge, sun
  passthrough, now/cursor lines, legend, clock style, local-noon.
- Sun times computed at each city's local noon (upstream behaviour), keyed by
  full city id. The port's own zone id carries the coordinates, so no
  Wallace-Idaho fallback exists here.
