# yatt

Type a time the way you say it — `15-17 sf`, `tomorrow 9 utc`, `thu 17 et` — and
read the same moment in every place you care about. An empty search box shows the
current time everywhere, ticking.

Deployed from `alexbartok/yatt-for-raycast` at `ebc6660` with the manifest
rewritten and three measured patches; see
[`docs/audits/yatt.md`](../docs/audits/yatt.md).

## Input

| Query | Means |
| --- | --- |
| `15`, `15:30`, `3pm`, `1530` | that time today, in the default zone |
| `15 sf`, `sf 15` | 15:00 in San Francisco |
| `15-17 sf`, `15 sf 2h` | a window, or a window of that length |
| `tomorrow 15 sf`, `thu 17 et`, `29 oct 15 sf` | another day |
| `15 utc+2` | a fixed offset |
| `sf` | the current time there |
| *(nothing)* | now everywhere |

A bare number is 24-hour (`7` is morning, `7pm` evening). A place is one of your
locations, its first letters, an airport or UN/LOCODE (`SFO`, `ZRH`), a zone
abbreviation (`cest`, `pt`) or a zone name. Your list is matched first, then
69 684 cities, 68 640 smaller places and 432 zones — which is why `cst` is
Chicago until you add a Chinese city.

A row shows an hour dot (green 9–18, yellow 7–9 and 18–21, red otherwise), the
time, the zone abbreviation, the offset from the anchor and `+1d`/`−1d`.
`Show Hour Strip` draws an hour band per location.

## Commands

| Command | Does |
| --- | --- |
| Convert Time | the expression, one row per location, copy, hour strip |
| Manage Locations | add, edit, alias, reorder and remove; export and import JSON |

Convert Time takes an optional argument, so it can open with an expression.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Convert | copy the row | `Enter` |
| Convert | re-anchor | `ctrl+shift+enter` |
| Convert | hour later / earlier | `ctrl+→` / `ctrl+←` |
| Convert | 15 min later / earlier | `ctrl+shift+→` / `ctrl+shift+←` |
| Convert | next / previous day | `ctrl+shift+↓` / `ctrl+shift+↑` |
| Convert | hour strip | `ctrl+i` |
| Convert | remove location | `ctrl+x` |
| Convert | Manage Locations | `ctrl+shift+m` |
| Manage | add / edit | `ctrl+n` / `ctrl+e` |
| Manage | set as home | `ctrl+shift+h` |
| Manage | move up / down | `ctrl+alt+↑` / `ctrl+alt+↓` |

## Preferences

`Time Format`, `Copy Template` and `Copy Separator`, `Sort Locations`,
`Business Hours` and `Shoulder Hours` with a colour each, `Locations File` (point
it at a synced folder to share the list), the default anchor zone, return to the
root search after copying, always show a Local row, how to read `3/9`, and the
OpenStreetMap lookup for places the bundle lacks.

## Measured

- 8.5 MB of JSON, parsed on the first search in the Manage view, never per
  keystroke; folded names are built once per dataset.
- Three cities in `America/Coyhaique` are absent from this Node's ICU; rows that
  cannot be formatted are dropped instead of throwing.
- `cst` is Chicago, `ist` Kolkata, `pt` Los Angeles, against the bundled table.
- The copy line reads `15:00–17:00 SFO (PST)`.

## Cut from upstream

The menu-bar clock and its preferences and fields (Vicinae has no Linux menu bar
and the command is absent when one is declared), six Raycast-only icon names, and
menu-bar wording.

## Data and network

Code MIT © Alex Bartok; data under GeoNames (CC BY 4.0), UN/LOCODE, OSM (ODbL),
OurAirports, `@vvo/tzdb` and Unicode CLDR, with notices in
`assets/NOTICE.md`. Nothing leaves the machine unless a search has no local hit
and online lookup is on: one Nominatim request fills the OpenStreetMap rows.
