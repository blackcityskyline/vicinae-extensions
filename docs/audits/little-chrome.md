# Little Chrome — port audit

Upstream: `raycast/extensions/extensions/little-chrome` at commit
`a3c38767c50d11db6bc3e489615bff315b2d8058` by `tompenguin` (MIT).

What it does: type a URL or a search, get it in a chromeless single-window
browser, with history suggestions underneath. Like Little Arc, but for Chrome.

## Upstream inventory

| | |
| --- | --- |
| Commands | 5 — `open-little-chrome` (view), `open-url` (no-view), `copy-url` (no-view), `open-in-tab` (no-view), `manage-hidden` (view) |
| Preferences | 2 — width, height |
| Dependencies | `@raycast/api` only |
| Source files | 7, ~600 lines |
| Platform | macOS |

How it works, as read from the source:

- The window is `open -na "Google Chrome" --args --app=<url> --window-size=W,H`.
  There is no browser API involved: Chrome's own app mode does the work.
- After launching it snapshots window ids, then polls (`40 × 75 ms`) for a new
  window with exactly one tab on the requested host, records that id in
  `LocalStorage`, and only then resizes it via AppleScript. The id list is the
  only way it can tell its own windows from the user's.
- Suggestions come from a snapshot copy of Chrome's `History` and `Favicons`
  SQLite files, queried with `sqlite3 -json`. Ranking is inline frecency:
  `(visit_count + 2 × typed_count) × recency bucket × 3 if the typed word starts
  the host`, top 50. Favicons are written out of `favicon_bitmaps` as PNGs and
  cached by bitmap id and update time.
- Hidden suggestions live in `LocalStorage`, keyed by Chrome profile, and never
  touch Chrome's history.
- `copy-url` and `open-in-tab` read the active tab of the front Chrome window
  through AppleScript.

## Why it does not run as it stands

Every interesting path is macOS-only: `osascript`, a System Events frontmost
check, AppleScript window enumeration, and
`~/Library/Application Support/Google/Chrome`.

## What the port changes

| Upstream | Port | Why |
| --- | --- | --- |
| `open -na` + AppleScript resize | spawn the browser binary with `--app` and `--window-size`, detached | No AppleScript, and `--window-size` already sizes the window before it maps, so nothing has to run after the launch |
| Window id bookkeeping in `LocalStorage` | removed | It only existed so `open-in-tab` and `copy-url` could tell app windows from normal ones; both are cut (below) |
| Chrome stable only | `browser` preference: auto, Helium, Chromium, Thorium, Brave, Chrome | The user's request, and the same list `webapp-maker` uses |
| Profile from `Local State → profile.last_used` | `last_used`, then `last_active_profiles[0]`, then the profile whose `History` was written last, then `Default` | `last_used` is gone from current builds: measured on Helium and Brave, `profile` has `info_cache`, `last_active_profiles`, `profiles_order`, `metrics` and no `last_used` |
| Blocklist key `blocklist:<profile>` | `little-chrome:blocklist:<browser>:<profile>` | Two browsers on one machine would otherwise share a blocklist |

Deliberately dropped:

- **`copy-url`.** It needs the active tab's URL of the front browser window. On
  Linux that is only reachable by pressing keys into the window (the repo
  forbids it: nothing can verify the focus, so a miss lands in another window
  and reports success) or by restarting the browser with `--remote-debugging-port`.
  Neither is acceptable for a launcher command.
- **`open-in-tab`.** Same missing input: it moves the app window's only tab into
  a normal window, which requires reading that window's URL. The Chromium
  window title is the page title, not the URL, and the `--app` window's
  `WM_CLASS` only carries the host.
- The upstream comment about a view command dying before its own post-launch
  resize does not apply: there is no post-launch work left, so the view opens the
  window itself instead of handing off to a `no-view` command.
- The `selectedItemId` trick that keeps the top history row selected on every
  query: Vicinae's `List` has no such prop. Rows are therefore
  query-row-first, and `Enter` opens what was typed while the best history match
  sits directly underneath. This is a real behaviour change, written down in the
  README.

Kept as upstream had it:

- `filtering={false}` with a SQL-backed search. This is not the builtin fuzzy
  filter being bypassed for convenience: matching happens in SQLite, against
  Chrome's own data, and the `List` filter has nothing to match against.
- The empty-search cache, so reopening the command shows the last suggestions
  before the query finishes.
- Debounce (150 ms) on every query except the first, so typing does not spawn an
  `sqlite3` process per keystroke.

## Measurements taken

On the development machine, 2026-11-11:

- Installed browsers: `helium-browser` (`/usr/bin/helium-browser`) and `brave`
  (`/usr/bin/brave`). Chromium, Thorium and Chrome are not installed, so their
  binary names and config directories are the conventional ones and were not
  exercised.
- Config directories present: `~/.config/net.imput.helium` and
  `~/.config/BraveSoftware/Brave-Browser`. Helium's `Default/History` is
  8,290,304 bytes with 179 rows in `urls`; Brave's is 458,752 bytes.
- `urls` schema: `id, url, title, visit_count, typed_count, last_visit_time,
  hidden` — the columns the query needs.
- `icon_mapping` and `favicon_bitmaps` are not in `History`; they live in the
  sibling `Favicons` database, so the query attaches it.
- `sqlite3` 3.54.1 on `PATH`.
- `Local State → profile` has no `last_used` (see the table above).
- Default browser is `zen.desktop`, which is not Chromium-family, so `auto` has
  to fall back to the first browser whose history directory exists.

## Verification

`npm run lint && npm run check && npm test && npm run build`, then launch each
command. What could and could not be exercised is listed under "Not verified" in
the extension README.
