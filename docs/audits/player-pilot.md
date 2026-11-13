# Audit: `player-pilot` ← `dagimg-dot/vici-extensions-official`

[dagimg-dot/vici-extensions-official](https://github.com/dagimg-dot/vici-extensions-official),
`extensions/player-pilot` (MIT). The store sells it as `dagimg-dot/player-pilot`; the installed
package is `store.vicinae.player-pilot`. It is a Vicinae-native extension, not a Raycast one:
the source imports `@vicinae/api` directly, so the fork needs no `@raycast/api` shim.

**Source and store disagree on the API version.** `main` declares `@vicinae/api ^0.14.0` in its
`package.json`; the store listing reports `apiVersion ^0.22.2`. This machine runs Vicinae 0.30.0
and `@vicinae/api` 0.29.2, and the *published bundle* renders fine, so the difference is stale
metadata somewhere, not a compatibility wall.

387 lines of TypeScript in five files, no tests, one runtime dependency (`playerctl`, present at
`/usr/bin/playerctl` v2.4.1). Nothing else: no HTTP, no daemon, no config file.

- `src/player-pilot.tsx` (149 lines) — `Grid`, two or three columns, `aspectRatio="3/2"`,
  `inset=Small`, one section, one item per player.
- `src/utils/playerctl.ts` (189) — `playerctl` wrappers: list, status, metadata, position, action.
- `src/utils/preferences.ts` (18) — reads the `playerctl-players` text preference.
- `src/utils/no-view-command.ts` (26) — shared body of the four no-view commands.
- `src/next-track.ts`, `pause-track.ts`, `previous-track.ts`, `resume-track.ts` (5 each) — one call
  into the shared no-view body.

| Upstream command | Mode | Action |
| --- | --- | --- |
| `player-pilot` | view | the grid |
| `resume-track` | no-view | `playerctl play` |
| `pause-track` | no-view | `playerctl pause` |
| `next-track` | no-view | `playerctl next` |
| `previous-track` | no-view | `playerctl previous` |

## What the machine actually reports

Measured 2026-11-13 with the system browser playing a YouTube track, `playerctl` v2.4.1.

| Call | Measured |
| --- | --- |
| `playerctl --list-all` | one line: `firefox.instance_1_45` |
| `playerctl --player firefox.instance_1_45 status` | `Playing` |
| `playerctl --player firefox.instance_1_45 position` | `0.000009` — seconds, float |
| `playerctl ... metadata` | `<player> <key> <value>` columns, padded with spaces: `firefox xesam:title`, `firefox xesam:artist Денис Селезнëв`, `firefox mpris:artUrl file:///home/black/.config/zen/firefox-mpris/9026_1.png`, `firefox xesam:album` (empty), `firefox mpris:trackid`, `firefox xesam:url`. **No `mpris:length`** for this stream |
| `playerctl ... metadata --format '{{status}}|{{title}}|...'` | one delimiter-separated line; no parsing of padded columns needed |

Two things the upstream parser gets wrong on this data, both visible live:

- The player name in `metadata` output is the family (`firefox`), not the MPRIS name
  (`firefox.instance_1_45`). Upstream stores it as `metadata.player` and never uses it.
- `xesam:album` is an empty string, not absent. Upstream's subtitle is
  `artist - ${album ?? "Unknown"}`, so the empty string passes the nullish check and the row reads
  `Денис Селезнёв - ` with a trailing dash (seen in the live grid).

## Live run

Launched `@dagimg-dot/store.vicinae.player-pilot/player-pilot` in Vicinae 0.30.0. The published
bundle rendered: search bar `Search players...`, a `Media Players` section with one card, the
cover art, the title `▶️ Firefox - Разбираем Егора Яковлева…`, the subtitle, and the status bar
`Players - Firefox` / `Pause` / `Actions`.

Environment caveat, and it is ours, not the extension's: `/usr/bin/node` on this machine cannot
load (`libsimdjson.so.36` is missing; the package ships `.so.34`) and Vicinae's managed runtime is
not installed, so the extension manager crashes on start. All measurements here ran with
`VICINAE_NODE_BIN=/tmp/opencode/node-v22.14.0-linux-x64/bin/node` staging Node 22.14.0 in `/tmp`.
With `/usr/bin/bun` as the substitute the same bundle crashed with `Element type is invalid`; that
is bun standing in for node, not a defect of the extension.

## What it costs while the view is open

The component polls every 2000 ms, and each poll spawns one process per call. Measured by putting
a logging wrapper named `playerctl` first on the server's `PATH` and counting its lines for 10 s
with one player: **25 spawns in 10 s** — 5 × `--list-all`, 10 × `status`, 5 × `metadata`,
5 × `position`. That is 2.5 processes a second, forever, for a window that redraws a line of text.

One of the five is redundant: `getPlayerMetadata` asks for `status` a second time even though
`getAllPlayers` already has it, and `position` is a separate call only because the parser reads
the padded column layout. The fork asks `status` once and takes title, artist, album, art URL,
length and position from one `metadata --format` answer, which measures **15 spawns in 10 s**
on the same player: `--list-all`, `status` and one `metadata`, 3 per cycle.

## What maps, what is cut

| Upstream | Fork | Why |
| --- | --- | --- |
| `Grid` with 2–3 columns, `3/2`, `inset=Small` | kept as the first view | it is the whole product |
| — | **new** `List` with `isShowingDetail`: players on the left, cover art and metadata in the panel | the requested second view; a launcher has no other way to show a picture beside a list |
| title `▶️ Firefox - <track>` | status as an icon, player name as the title, track as the subtitle | an emoji in a title is a font bet; a grid item takes `Icon` |
| subtitle `artist - album` | `artist – album` only when both are non-empty, else the track, else the status | measured: an empty album leaves a trailing dash |
| `playerctl --player <name> <verb>` through `exec` with interpolation | `execFile("playerctl", [...])` | a D-Bus name is interpolated into a shell; arguments exist |
| second `status` call inside `getPlayerMetadata` | **cut** | already known; one process fewer per poll |
| `playerName.includes(preferred) \|\| preferred.includes(playerName)` | match on the family before the first dot, case-insensitive | `spot` would otherwise also match `spotify` *and* any player whose name contains `spot` |
| `Promise.all(names.map(() => execute(...)))` with no `await` | awaited | unhandled rejections are silent, and the toast then lies |
| `playerctl-players` text preference (`%any`) | kept, same name and meaning | it is the only setting |
| actions: play/pause, next, previous, stop | same four, each with a shortcut | every action in this repo has one; upstream has none |
| 2 s polling by spawning, no follow mode | 2 s, metadata through `--format` | `--follow` keeps a process alive per player, which the repo rules out; the format template avoids column parsing |
| `README.md` feature list, no install notes | rewritten | the store blurb is not documentation |
