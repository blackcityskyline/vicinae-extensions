# Audit: YATT, deployed and measured

Upstream is `raycast/extensions/extensions/yatt` at `ebc6660` — `alexbartok/yatt-for-raycast`,
"Yet Another Timezone Tool": 2 858 lines over 22 files, three commands, two runtime
dependencies (`@raycast/api`, `tz-lookup`), `platforms: ["macOS"]`, and 8.5 MB of
generated JSON in `assets/data/`.

## What the extension is

| Piece | Lines | What it does |
| --- | --- | --- |
| `core/parse.ts` | 215 | Turns `15-17 sf 2h`, `tomorrow 9 utc`, `thu 17 et`, `29 oct 15 utc+2` into a time, a range, a date and a leftover place query. Nothing else in the extension knows about text |
| `core/resolve.ts` | 191 | Matches that place query against your locations, the dataset and the zone table |
| `core/time.ts` | 158 | Zone arithmetic on `Intl` only: offsets, wall clock, day rolls |
| `core/dataset.ts` | 182 | Row decoding, ranked search over cities/places/zones, exact lookup for a typed token |
| `core/store.ts`, `file-backend.ts` | 201 | The location list: `LocalStorage`, or a JSON file the user points at, with a lock for two commands |
| `core/format.ts`, `business.ts`, `strip.ts`, `text.ts` | 309 | Copy templates, hour shades, the hour-strip markdown, accent folding |
| `convert.tsx` | 508 | The expression list, copying, nudging, the hour strip |
| `manage-locations.tsx` | 499 | The list, add (dataset + OpenStreetMap), edit, home, order, export/import |
| `menu-bar-clock.tsx` | 87 | A `MenuBarExtra` title built from the same templates |

## Deployed rather than ported

The extension imports `@raycast/api` and Vicinae resolves it at runtime, so the
first attempt was upstream with only the manifest rewritten: `name`, `title`,
`icon`, `platforms: ["Linux"]`, `author: black`, `contributors`, and the scripts
replaced with `vici lint|build`, `tsc` and `vitest`. That built and ran: `convert`
rendered the five seed locations, `15-17 sf` produced the window per zone, `Enter`
copied `15:00–17:00 SFO (PST)`, and a launch argument (`-- "thu 17 et"`) landed in
the search box.

Three things did not survive contact, and only those were patched.

### The menu bar command is not a command here

`vicinae cmd ls` lists `@black/yatt:convert` and `@black/yatt:manage-locations`;
`@black/yatt:menu-bar-clock` is absent, and launching it answers
`Unknown command entrypoint`. Vicinae has no menu bar on Linux
(`docs/authoring-extensions.md`: a Linux-only extension should not use
`menu-bar`), while `vici lint` and `vici build` accept the manifest entry
silently. Removed with it: the three `menuBar*` preferences, the per-location
`menuBar` field in `Location`, the "Show in Menu Bar" action, the menu bar
accessory in Manage Locations, and `refreshMenuBar()` in `src/lib/storage.ts`,
which every save called and which only ever logged a failure.

### Three Chilean cities throw on this runtime

The assets are tzdata 2025b; the ICU bundled with this machine's Node 22 knows
`America/Coyhaique` not at all. Measured: of 69 684 cities and 68 640 places,
exactly three rows carry it (`Coyhaique`, `Puerto Aysén`, `Puerto Cisnes`), and
`Intl.DateTimeFormat` throws on every one. Adding such a city would have thrown
inside the render. `supportedOnly(ds)` in `src/core/dataset.ts` now drops rows the
runtime cannot format, and `test/data.test.ts` checks it with a synthetic
`Not/AZone` row as well as against the real assets.

### A keystroke cost 300 ms

The upstream search folds every name on every query — 138 324 names through
`String.normalize` per keystroke. Measured with upstream's own test: seven queries
took 2 434 ms against a 1 500 ms budget, so the check failed on this machine.
Folded names are now built once per dataset and cached in a `WeakMap`; the same
seven queries take 330 ms, the first of them including the build. The upstream
test kept its shape.

## Raycast names that Vicinae does not have

`Icon.Globe`, `Icon.Clipboard`, `Icon.Gear`, `Icon.List`, `Icon.Document` and
`Icon.QuestionMark` type-check against `@raycast/api` but are `undefined` at
runtime. Replaced by names both APIs carry — `Compass`, `CopyClipboard`, `Cog`,
`BulletPoints`, `Book`, `QuestionMarkCircle`. `Compass` is the only substitution
that changes the picture: there is no globe in Vicinae's set that Raycast also has.

Two user-facing strings named Raycast: the Manage Locations subtitle now reads
"stored by Vicinae on this machine", and the settings describe "the launcher's own
Pop to Root setting". The Nominatim `User-Agent` still names the upstream project,
which is the client this is derived from.

## What ran live

Driven on 2026-11-13 against Vicinae 0.30.0, captured with `grim` and read with
`tesseract`.

| Step | Result |
| --- | --- |
| Empty `convert` | Five seed locations, each with its code, abbreviation, offset and the current time; Local on top, marked anchor |
| `15-17 sf` | Six rows of windows (`18:00-20:00 +3h`, `23:00-01:00`, …), footer `Copy San Francisco` |
| `Enter` | Clipboard held `15:00–17:00 SFO (PST)` |
| `-- "thu 17 et"` | Launch argument arrived and 17:00 was the anchor row |
| Manage Locations | Five locations with alias tags, abbreviations and times; subtitle "stored by Vicinae on this machine" |
| Add, `berlin` | Ranked list: Berlin (Germany) first, then Berlin in El Salvador, New Hampshire, New Jersey, Wisconsin, plus Köpenick, Neukölln, Kreuzberg |
| Add → Enter | Six locations, Berlin with `CET 10:12` |
| Rebuild and relaunch | Berlin still there: the list came back from `LocalStorage` |
| Convert | Seven rows including Berlin, sorted west to east around the Local anchor |
| Remove (`ctrl+x`) | Back to five |

Unverified: the OpenStreetMap fallback. Every query tried had a local hit, and the
fallback only fires when nothing local matches after a 1.1 s pause, so no request
was made.

## Preferences kept

All of upstream's, minus the three menu-bar ones: `Time Format`, `Copy Template`,
`Copy Separator`, `Sort Locations`, `Business Hours`, `Shoulder Hours`, six colour
overrides, `Locations File`; per command, `Default Anchor Zone`,
`Pop to Root After Copying`, `Local Row`, `Numeric Date Order` and `Online Lookup`.

## Tests

Upstream's six files, 57 checks, run with `vitest run` (the repository already
carries vitest for `obsidian`). They cover the parser, resolver, zone arithmetic,
storage round trips, the hour strip and the dataset itself. Two were changed: the
data check now asserts over what the loader keeps, and a new check proves a row in
an unformattable zone is dropped.

## Costs

| | |
| --- | --- |
| data on disk | 8.5 MB |
| parse of all three files | 237 ms, once per command, on the first search in the add view |
| first search after that | 330 ms for seven queries, including the folding pass |
| memory | the 69 684 city rows and their folded names stay for the life of the worker |
