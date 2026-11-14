# yatt — Yet Another Timezone Tool

Two views over one list of cities. **Convert Time** takes a time the way you say it
(`15-17 sf`, `thu 17 et`, `tomorrow 9 utc`) and shows it everywhere. **In the
Timezone** draws a whole day per location — hour cells, working hours, sunrise and
sunset — and lets you scrub it.

A fork of `alexbartok/yatt-for-raycast` with `i_idz/in-the-time-zone` merged in.

## Input

| Query | Means |
| --- | --- |
| `15`, `15:30`, `3pm`, `1530` | that time today, in the default zone |
| `15 sf`, `sf 15` | 15:00 in San Francisco |
| `15-17 sf`, `15 sf 2h` | a window, or a window of that length |
| `tomorrow 15 sf`, `thu 17 et`, `29 oct 15 sf` | another day |
| `15 utc+2`, `sf` | a fixed offset, the current time there |
| *(nothing)* | now everywhere, ticking |

A bare number is 24-hour (`7` morning, `7pm` evening). A place is one of your
locations, its first letters, an airport or UN/LOCODE (`SFO`, `ZRH`), a zone
abbreviation (`cest`, `pt`) or a zone name. Your list is matched first, then
69 684 cities, 68 640 smaller places and 432 zones — which is why `cst` is Chicago
until you add a Chinese city.

## Commands

| Command | Does |
| --- | --- |
| Convert Time | the expression, one row per location, copy, hour strip. Takes an optional argument |
| In the Timezone | the day timeline: scrub, snap, copy the base time |
| Manage Locations | add, edit, alias, reorder, set home; export and import JSON |

Convert Time shows an hour dot per row (green business, yellow shoulder, red off)
with the offset and `+1d`/`−1d`. `Show Hour Strip` draws an hour band per location.
In the Timezone colours the same bands, splits at four locations into two images,
and marks the home location's column as the base everything is measured against.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Convert | copy the row | `Enter` |
| Convert | re-anchor | `⌘⇧Enter` |
| Convert | hour later / earlier | `⌘→` / `⌘←` |
| Convert | 15 min later / earlier | `⌘⇧→` / `⌘⇧←` |
| Convert | next / previous day | the launcher's Move Down / Move Up key |
| Convert | hour strip | `⌘I` |
| Convert | remove location | `⌃X` |
| Timeline | scrub by the preference's minutes | `→` / `←` |
| Timeline | scrub by the alternate minutes | `⌥→` / `⌥←` |
| Timeline | snap to the next / previous step | `⇧→` / `⇧←`, with `⌥` for the alternate |
| Timeline | back to now | `⌃N` |
| Timeline | copy the base time | the launcher's Copy key |
| Both | Manage Locations | `⌘⇧M` |
| Manage | add | the launcher's New key |
| Manage | set as home | `⌘⇧H` |
| Manage | move up / down | `⌘⌥↑` / `⌘⌥↓` |

Bare arrows do not always reach the timeline actions inside the launcher; `⌥` and
`⇧` always do.

## Preferences

`Time Format` (`system`, `24h`, `12h`), `Copy Template` and `Copy Separator`,
`Sort Locations`, `Local Row`, `Business Hours` and `Shoulder Hours` with a dot
colour each and three hour-colour overrides for the strip and timeline,
`Locations File` (point it at a synced folder to share the list). Per command:
the two scrub steps on the timeline, the default anchor zone, return to root
after copying, how to read `3/9`, and the OpenStreetMap lookup on Manage.

## Requirements and limits

- Linux, Vicinae, `@raycast/api` resolved by the launcher. No network unless a
  place is not in the bundle and `Online Lookup` is on.
- The home location is the timeline's base; without one the machine's own zone is.
- Sunrise and sunset need coordinates the bundled dataset does not carry: they are
  looked up by name and zone in `city-timezones`, so a renamed or custom place
  shows `—`.
- 8.5 MB of JSON, parsed on the first search in Manage, never per keystroke.

## Data

Code MIT © Alex Bartok; data under GeoNames (CC BY 4.0), UN/LOCODE, OSM (ODbL),
OurAirports, `@vvo/tzdb`, Unicode CLDR, `city-timezones` and SunCalc, with notices
in `assets/NOTICE.md`. One Nominatim request fills the OpenStreetMap rows.
