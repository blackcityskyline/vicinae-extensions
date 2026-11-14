# in-the-time-zone

See the time in several cities at once, and scrub it forward and back to work out
when it is somewhere else.

Ported from [`i_idz/raycast-extensions`](https://github.com/i_idz/raycast-extensions)
(MIT); the timeline is a port of its SVG renderer. Measurements are in
[`docs/audits/in-the-time-zone.md`](../docs/audits/in-the-time-zone.md).

## Views

`Ctrl+E` opens the list, `Ctrl+L` the timeline; the timeline opens by default.

- **Timeline** — an SVG per city: 24 hour cells coloured by band (work 9–5,
  sleep 10–6, marginal between), a line on now, a red cursor with its time,
  GMT and delta badges, sunrise and sunset, and the legend.
- **List** — `Base Time` is the reference (a pinned city or the machine's zone),
  `Cities` everything else. Typing searches all 7 329 cities; picking one adds it
  and makes it the base.

## Keys

`Alt+←/→` scrub by half an hour, `Shift+←/→` snap to the hour, `Shift+Alt+←/→` to
the half hour, `Ctrl+N` now, `Ctrl+0` system zone, `Ctrl+I` set as base,
`Ctrl+Backspace` remove the city. Bare arrows are not passed to actions by
Vicinae, hence the modifiers.

## Port changes

- `Intl.DateTimeFormat` with an explicit `timeZone` replaces luxon, with the
  locale pinned to `en-US` so the machine's locale cannot reorder dates or switch
  to a twelve-hour clock.
- Coordinates live in the zone id (`timeZone|city|lat|lon`), so sunrise cannot
  land on the wrong city in a zone.
- Search orders by population; the dataset is alphabetical by country.

## Costs

The city dataset is 1.3 MB and loads in 45 ms; two timeline SVGs take a few
milliseconds for six cities.
