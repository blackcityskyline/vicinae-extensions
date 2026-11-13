# yatt

Type a time the way you say it — `15-17 sf`, `tomorrow 9 utc`, `thu 17 et` — and
read the same moment in every place you care about. An empty search box shows the
current time everywhere, ticking.

Deployed from `alexbartok/yatt-for-raycast` at Raycast `ebc6660` with the manifest
rewritten and three measured patches; see
[`docs/audits/yatt.md`](../docs/audits/yatt.md).

## What you can type

| Query | Means |
| --- | --- |
| `15`, `15:30`, `3pm`, `1530` | that time today, in the default zone |
| `15 sf`, `sf 15` | 15:00 in San Francisco |
| `15-17 sf`, `11-1pm` | a window |
| `15 sf 2h`, `15 sf 90m` | a window of that length |
| `tomorrow 15 sf`, `thu 17 et`, `29 oct 15 sf`, `2026-10-29 15 sf` | another day |
| `15 utc+2` | a fixed offset |
| `sf` | the current time there |
| *(nothing)* | now, in every location, ticking |

A bare number is 24-hour, so `7` is morning and `7pm` is evening. A place is one
of your locations, its first letters, an airport or UN/LOCODE code (`SFO`, `JFK`,
`ZRH`), a zone abbreviation (`cest`, `pt`, `cst`) or a zone name
(`Europe/Berlin`). Your own list is matched first, then 69 684 cities and 68 640
smaller places, then the 432 named zones — which is why `cst` is Chicago until you
add a Chinese city.

## What a row says

A coloured dot for the hour there (green 9–18, yellow 7–9 and 18–21, red
otherwise), the time or window, the zone abbreviation, the offset from the anchor
place and a `+1d`/`−1d` when that row has crossed midnight. `Show Hour Strip`
draws one column per location and one row per hour with your window as a band
across them.

## Commands

| Command | What it does |
| --- | --- |
| Convert Time | The expression, one row per location, copying, and the hour strip |
| Manage Locations | Add, edit, alias, reorder and remove the cities and zones, export and import as JSON |

The command takes an optional argument, so it can be launched with an expression
already in place.

## Keys

`cmd` is control on Linux, which is what Vicinae does with Raycast's modifier.

| Where | Action | Key |
| --- | --- | --- |
| Convert | Copy the selected row | `Enter` (the first action) |
| Convert | Copy every row as one line | — (panel only, as upstream) |
| Convert | Re-anchor on a row | `ctrl+shift+enter` |
| Convert | An hour later / earlier | `ctrl+→` / `ctrl+←` |
| Convert | 15 minutes later / earlier | `ctrl+shift+→` / `ctrl+shift+←` |
| Convert | Next / previous day | `ctrl+shift+↓` / `ctrl+shift+↑` |
| Convert | Show or hide the hour strip | `ctrl+i` |
| Convert | Remove the selected location | `ctrl+x` |
| Convert | Manage Locations | `ctrl+shift+m` |
| Manage | Add a location | `ctrl+n` |
| Manage | Edit | `ctrl+e` |
| Manage | Set as home | `ctrl+shift+h` |
| Manage | Move up / down | `ctrl+alt+↑` / `ctrl+alt+↓` |
| Manage | Remove | `ctrl+x` |

## Preferences

`Time Format`, `Copy Template` and `Copy Separator`, `Sort Locations`
(west→east, east→west, or the order in Manage Locations), `Business Hours` and
`Shoulder Hours` with a hex colour each for the dot and for the hour strip, and
`Locations File` — point it at a path in a synced folder to share the list between
machines. Convert Time adds its default anchor zone (local, UTC, home or last
used), whether to return to the root search after copying, whether to always show
a Local row, and how to read `3/9`. Manage Locations adds the OpenStreetMap
lookup for places the bundled list does not have.

## Measured

- The bundled data is 8.5 MB of JSON: 69 684 cities, 68 640 UN/LOCODE places,
  432 zones. Parsing all three takes 237 ms, and that happens on the first search
  in the add view, never on a keystroke before it.
- Folding every name per query cost 300 ms a keystroke; folded names are now built
  once per dataset (`src/core/dataset.ts`), and seven queries take 330 ms in total
  including that build.
- Three Chilean cities in `America/Coyhaique` are in the assets but not in the ICU
  of this machine's Node 22, and formatting them throws. The loader drops the rows
  it cannot format instead of throwing on render; `supportedOnly` is the tested
  seam.
- `cst` resolves to Chicago, `ist` to Kolkata, `pt` to Los Angeles — measured
  against the bundled zone table, not assumed.
- The copy line came out as `15:00–17:00 SFO (PST)` for `15-17 sf`.

## What was cut, and why

**The menu bar clock.** Vicinae has no menu bar on Linux — `docs/authoring-extensions.md`
says a Linux-only extension should not use `menu-bar`, and the command is silently
absent from `vicinae cmd ls` when it declares one. The command, its three
preferences, the per-location menu bar fields and the "Show in Menu Bar" action are
gone; the Convert Time and Manage Locations views are untouched by that.

**Six Raycast icon names** that Vicinae does not have (`Globe`, `Clipboard`,
`Gear`, `List`, `Document`, `QuestionMark`) became the names both APIs share, with
`Compass` standing in for the globe.

**No menu-bar wording.** The list says "stored by Vicinae on this machine" and the
settings speak of "the launcher's root search", not Raycast's.

## Data and licences

The code is MIT, © Alex Bartok, and the data stays under its own terms: GeoNames
(CC BY 4.0, modified), UN/LOCODE (UNECE), OpenStreetMap-derived coordinates and
zone boundaries (ODbL), OurAirports (public domain), `@vvo/tzdb` (MIT) and Unicode
CLDR. The notices ship as `assets/NOTICE.md` and open from Manage Locations.

## What leaves your machine

Nothing unless a search has no local hit and online lookup is on: one request to
OpenStreetMap's Nominatim, which is what fills the "Search OpenStreetMap" rows.
