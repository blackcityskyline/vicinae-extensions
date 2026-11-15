# Weather Fox

Animated weather scenes, live precipitation radar and Cast, a fox mascot who acts out the
current weather, for one or more cities. No account or API key. Ported from
[luarmr/weather-fox](https://github.com/raycast/extensions/tree/9682d1b4c0dd08e1edd99410587ac165fd67aa85/extensions/weather-fox)
at `9682d1b` and deployed as written apart from the manifest, the icon path, the tsconfig and
the changes listed below.

Data comes from [Open-Meteo](https://open-meteo.com) (forecast, geocoding, air quality),
[RainViewer](https://www.rainviewer.com) (radar) and the US National Weather Service (alerts).

## Commands

- **Weather** — three views, switched with `Open <next view>` in the action panel or the
  `Switch View` submenu; the last choice is remembered.
  - **Forecast list** — current conditions, then 7 or 16 days (`ctrl+shift+d` toggles), each
    row with a detail panel: hero scene, hourly temperature curve, precipitation, UV, wind.
  - **Today** — hero scene, rain nowcast, the next 10 hours and the stats sidebar.
  - **Radar** — precipitation over an Esri basemap for the past hour plus a 30-minute
    nowcast. Zoom with `ctrl+alt+=` and `ctrl+alt+-`, pan with `ctrl+alt` and the arrows,
    recentre with `ctrl+shift+.`.
- **Cast Weather Fox** — the fox in his world, drawn from the current conditions.

First launch is a three-step wizard: city, units, theme. Cities are added with `ctrl+l`
(comma qualifiers narrow ambiguous names: `springfield, illinois`, `sydney, nsw`), the
active city switches with `ctrl+shift+]`, the theme with `ctrl+t`, units with `ctrl+u`.

## Differences from the Raycast extension

- **Weather in Menu Bar is cut.** Vicinae has no menu-bar commands, so `menubar` and
  `src/menubar.tsx` are gone. The in-command setting that pushed a refresh to it went too.
- **Image sharing works on Linux.** Upstream rasterized the share card with macOS's
  `qlmanage`, so it hid the PNG actions outside macOS. The rasterizer is now
  `rsvg-convert` (Debian/Ubuntu: `librsvg2-bin`) and the actions are always shown; a missing
  binary fails with a toast. The radar GIF actions needed no change.
- **Shortcut hints say Ctrl.** Upstream wrote `⌘`/`⌃` into error hints and kept its
  per-platform shortcut objects for macOS and Windows; Vicinae reads only the plain
  `{ modifiers, key }` form, so every shortcut now carries the Windows/Linux mapping.
- **Cast's scenes are still images here.** Vicinae renders the SVG markdown as a still; its
  SMIL animations do not play. The scene still follows the weather and time of day.
- **A missing storage key is `null`, not `undefined`** in Vicinae's `LocalStorage`; the
  read path now treats both as absent, so the backup is restored after a cache eviction.

## Notes

- Everything is configured in the command; the manifest has no preferences.
- `Copy Summary` copies a text forecast, `Copy Image` a 1680×1680 PNG of the current view,
  and the radar view adds animated GIF sharing.
- All data is read from the three public services above; no key or account is stored.
