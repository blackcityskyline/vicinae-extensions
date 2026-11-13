# in-the-time-zone

See the time in several cities at once, and scrub it forward and back to work
out when it is somewhere else.

Ported from [`i_idz/raycast-extensions`](https://github.com/i_idz/raycast-extensions)
(Raycast, MIT). The timeline is a port of its SVG renderer; the measurements
are in [`docs/audits/in-the-time-zone.md`](../docs/audits/in-the-time-zone.md).

## The two views

`Ctrl+E` opens the list, `Ctrl+L` goes back to the timeline. The timeline is
what opens by default.

**Timeline** — two stacked SVG images filling the pane, full width and full
height: a row of 24 hour cells per city
with the hour number inside each cell, coloured by the hour band (work
9 AM–5 PM, sleep 10 PM–6 AM, marginal in between), a green line on now, a red
line and its time label on the scrubbed cursor, GMT and delta badges, sunrise
and sunset per city, and the legend underneath.

**List** — `Base Time` is the reference, either a city you pinned or the
machine's own zone. `Cities` is everything else. Typing searches all 7 329 cities
in the dataset; picking one adds it and makes it the base.

## Keys

| Keys | Does |
| --- | --- |
| `Alt+←` `Alt+→` | scrub by half an hour (changeable) |
| `Shift+←` `Shift+→` | snap to the previous/next hour |
| `Shift+Alt+←` `Shift+Alt+→` | snap to the previous/next half-hour |
| `Ctrl+N` | back to now |
| `Ctrl+L` | timeline |
| `Ctrl+E` | list |
| `Ctrl+0` | use the system timezone |
| `Ctrl+I` | set the selected city as base |
| `Ctrl+Backspace` | remove the city |

Upstream scrubs with the bare `←`/`→`; Vicinae does not pass bare modifier-less
keys to actions (measured — see the audit), so the scrub lives on `Alt` and the
snap on `Shift`.

## What the port changed, and why

**No luxon.** `Intl.DateTimeFormat` with an explicit `timeZone` does all of it.
The locale is pinned to `en-US` on every call, so the machine's locale cannot
reorder a date or swap in a twelve-hour clock — the same trap
`shell-history` documents for `toLocaleString()`.

**Coordinates live in the zone id**, as `timeZone|city|latitude|longitude`.
Upstream stores `timeZone|city` and looks the city up again for its position,
falling back to the first city in the zone when the pair misses — which is
**Wallace, Idaho** for `America/Los_Angeles`, so the sunrise belongs to the
wrong place. Matching on the city name alone is worse still: the dataset's
`London` is in Ontario and its first `San Francisco` is in Argentina. Carrying
the coordinates makes the lookup impossible to get wrong.

**Search results are ordered by population.** The dataset is alphabetical by
country, so upstream's first hit for "San Francisco" is the one in Argentina.

## Tests

44 checks over four files:

| File | What it pins down |
| --- | --- |
| `test/time.test.ts` | offsets, including 45-minute and 12:45 zones; daylight saving read at the instant, not cached; the upstream hour bands; the twelve-hour clock with no zero padding; local noon; city order |
| `test/zones.test.ts` | id round-trip; the default coordinates still match the dataset |
| `test/timeline.test.ts` | 16 checks on the rendered SVG at the upstream screenshots' instant: cell colours, the bold cursor hour in each row's own local grid, badges, day diff, Local badge, sun passthrough, now and cursor lines, legend, clock style |
| `test/cities.test.ts` | the obvious city first; ids round-trip |

The timeline checks are the interesting ones. They run against the instant
behind the upstream screenshots — `2026-04-09T01:39:00Z` with Kolkata as the
base — and assert what the SVG says. If the renderer drifts, they say which
element moved.

## Costs

| | |
| --- | --- |
| city dataset | 1.3 MB, 45 ms to load |
| two timeline SVGs | a few ms to build for six cities |
