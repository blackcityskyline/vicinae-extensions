# timezones — Timezones

Three views over one list of cities. **Convert Time** takes a time the way you say it
(`15-17 sf`, `thu 17 et`, `tomorrow 9 utc`) and shows it everywhere. **In the
Timezone** draws a whole day per location — hour cells, working hours, sunrise and
sunset — and lets you scrub it. **Market Hours** draws the same day shaded by each
zone's market hours, with a line at every market open.

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
| Market Hours | the same timeline shaded by market hours, with a line and bar per trading session, default or your own list |
| Manage Locations | add, edit, alias, reorder, set home; export and import JSON |

Convert Time shows an hour dot per row (green business, yellow shoulder, red off)
with the offset and `+1d`/`−1d`. `Show Hour Strip` draws an hour band per location.
In the Timezone colours the same bands, splits at four locations into two images,
and marks the home location's column as the base everything is measured against.

## Market Hours

The same timeline as In the Timezone, over your locations, with market hours in
place of business hours: a row's cells take its region's colour while that zone's forex
session runs (Asia orange, Europe blue for Frankfurt and London, US green) and are grey
otherwise. On top of that the chart carries the
trading sessions: a dashed line and a name at each start, and a coloured bar across the
top for the ones that have an end. The legend line under the chart gives each start in
New York time, so it moves with the clock changes of each side.

**Which zones appear.** Each location has a **Show In** field in Manage Locations
(Edit…): both commands, Time Zones only, or Market Hours only. Add a place, edit it,
and a zone can be in Market Hours without being in the time zone strip or the other
way round. A location with no value, as every existing one is, shows in both. The
home location always shows in both, since every offset is measured from it. The field
is saved as `onlyIn` (`"timeline"` or `"market"`) in the locations file.

The **Sessions** preference of the command picks the list:

- **Default**: Asia (09:00 Tokyo), Frankfurt (08:00 Frankfurt, an hour before London in every
  season, since Europe and the UK change their clocks on the same day), London (08:00),
  Lunch (12:00–14:00 London, 07:00–09:00 New York), US (07:00–09:30 New York), AM (09:30–12:00), Lunch
  (12:00–13:00 New York) and PM (13:00–16:00). Each is a local wall-clock time in its own
  zone, converted through the IANA rules, so it follows that zone's daylight saving.
  Weekdays only.
- **Custom**: your own list, read from `market-sessions.json` in the extension's support
  folder, which is created from the defaults the first time you pick it. **Edit Custom
  Sessions** (ctrl+e) opens it and **Reload Sessions** (ctrl+r) rereads it; it is also
  reread every minute while the window is open. A mistake in it is shown as a message that
  names the session, not replaced by the defaults.

```json
{
  "sessions": [
    { "name": "AM", "timezone": "America/New_York", "start": "09:30", "end": "12:00", "color": "#30a46c" },
    { "name": "Asia", "timezone": "Asia/Tokyo", "start": "09:00", "color": "#f76b15", "days": ["mon", "tue", "wed", "thu", "fri"] }
  ]
}
```

`name`, `timezone` (an IANA name), `start` (`HH:MM`) and `color` (`#rgb` or `#rrggbb`) are
required. `end` is optional: without it the session is only a line, with it a bar too, and
an end at or before the start runs into the next day. `days` is optional and defaults to
Monday to Friday.

The defaults are my reading of your list, not market definitions: "Lunch" twice is
London's (12:00–14:00) and New York's (12:00–13:00) lunch, and the AM, PM and US times are conventions with no
source checked.

Each zone trades its own market: Tokyo has the TSE, London and UTC the LSE,
continental Europe Frankfurt (no cash shading: Frankfurt keeps no close), the US zones the NYSE; any other zone gets no market
shading rather than a guess. Forex sessions run around the cash market — Tokyo
09:00–18:00, London 08:00–17:00, New York 08:00–17:00. The hours are local
wall-clock constants converted through the IANA rules, so a 09:30 open is 14:30 UTC
in January and 13:30 UTC in July. Weekends, the TSE lunch break and the CME
overnight session are modelled; holidays and half-days are not.

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
| All commands | Manage Locations | `⌘⇧M` |
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
