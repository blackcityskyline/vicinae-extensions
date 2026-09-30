# in-the-time-zone

See the time in several cities at once, and scrub it forward and back to work
out when it is somewhere else.

Ported from [`i_idz/raycast-extensions`](https://github.com/i_idz/raycast-extensions)
(Raycast, MIT). Same two views, same keys, same layout.

## The two views

`Ctrl+E` opens the list, `Ctrl+L` goes back to the timeline. The timeline is
what opens by default.

**Timeline** — one row of 24 hour blocks per city, coloured by the hour band,
with a marker on the current one, and a clock above it aligned to that marker.
The panel on the right carries the base date, the legend, sunrise and sunset per
city, and the key hints.

**List** — `Base Time` is the reference, either a city you pinned or the
machine's own zone. `Cities` is everything else. Typing searches all 7 329 cities
in the dataset; picking one adds it and makes it the base.

## Keys

| Keys | Does |
| --- | --- |
| `←` `→` | scrub by an hour (changeable) |
| `Alt+←` `Alt+→` | scrub by half an hour (changeable) |
| `Ctrl+N` | back to now |
| `Ctrl+L` | timeline |
| `Ctrl+E` | list |
| `Ctrl+0` | use the system timezone |
| `Ctrl+Backspace` | remove the city |

The arrow keys are bound in the timeline only. In the list they move the
selection, and an action on them would leave the list impossible to walk.

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

**Nothing on a timeline line is wider than the bar.** Upstream lays its labels
out to 67 cells against a 50-cell bar, so the GMT and delta columns are clipped
away at a normal window width — and the longest city name wraps onto a second
line, which its own screenshots show. Here the delta hangs off the right edge of
the bar, the GMT offset moved to the metadata panel where there is room, and
`test/timeline.test.ts` fails if any line goes past the bar or goes ragged.

**The keyboard hints name Linux keys.** Upstream writes `⌥← →` and `⌘N`; on this
platform `cmd` is control and `opt` is alt, so the hint would name keys that do
not exist.

## Tests

37 checks over four files:

| File | What it pins down |
| --- | --- |
| `test/time.test.ts` | offsets, including 45-minute and 12:45 zones; daylight saving read at the instant, not cached; hour bands; 12-hour clock with no zero padding |
| `test/zones.test.ts` | id round-trip; the default coordinates still match the dataset |
| `test/timeline.test.ts` | **every value against the upstream screenshots**, plus 24 blocks, the marker in the same column on every line, no overflow, no ragged lines |
| `test/cities.test.ts` | the obvious city first; ids round-trip |

The timeline checks are the interesting ones. They run against the instant
behind the upstream screenshots — `2026-04-09T01:39:00Z` with Kolkata as the
base — and assert all six cities' clocks, GMT offsets, deltas and day markers.
If the pipeline drifts, they say which value moved.

## Costs

| | |
| --- | --- |
| city dataset | 1.3 MB, 45 ms to load |
| one full paint | 4.75 ms for six cities, timeline and sunrise columns |
