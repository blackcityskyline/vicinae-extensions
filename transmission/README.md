# transmission

Drive a running Transmission daemon: list torrents with their progress and
speeds, start and stop them, add a magnet link or a `.torrent` file, configure a
torrent's limits, and open the daemon's own web interface.

| Command | What it does |
| --- | --- |
| List Torrents | Every torrent, polled every three seconds, with a detail pane: state, speeds, files, trackers |
| Add Torrent | A form for a magnet, a `.torrent` URL or a local `.torrent` path, prefilled from the clipboard |
| Open Web Interface | Opens the daemon's `/transmission/web/` in the browser |

## Preferences

`Host` (default `localhost`), `Port` (default `9091`), `HTTPS`, and a username
and password that are only sent when the daemon was started with `--auth`. The
password is a `password` preference, so it is not echoed back into the form.

The list is ordered by `Sort Torrents By` — progress, name, status or date added —
in the chosen `Sort Direction`. `Files Shown` caps the file rows in the detail
pane (0–100, 20 by default). `Quick Paths` is a comma-separated list of download
directories the add form offers; `~` is expanded before the path reaches the
daemon, which does not expand it itself.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Torrent | Start or stop | `ctrl+s` |
| Torrent | Open downloaded file(s) | `ctrl+o` (`open`); a submenu with `ctrl+1`…`ctrl+9` when there are several |
| Torrent | Add Torrent | `ctrl+n` (`new`) |
| Torrent | Configuration | `ctrl+e` (`edit`) |
| Torrent | Copy Magnet Link | `ctrl+shift+c` (`copy`) |
| Torrent | Open Web Interface | `ctrl+shift+w` |
| Torrent | Refresh | `ctrl+r` (`refresh`) |
| Torrent | Resume All / Pause All | `ctrl+shift+s` / `ctrl+shift+p` |
| Torrent | Open Download Directory | `ctrl+shift+d` |
| Torrent | Remove Torrent | `ctrl+x` (`remove`) |
| Torrent | Remove Torrent and Delete Files | `ctrl+shift+x` (`remove-all`, asks first) |
| Add form | Add Torrent | `ctrl+s` (`save`) |
| Add form | Insert Quick Path | `ctrl+q`, then `ctrl+1`… |

The named keys follow the user's `keybinds`; the literal ones are this
extension's own verbs.

## The detail pane

State, progress, size, done, speeds, ETA and ratio; directory, added date, piece
count and size, hash, private flag, creator, creation date and comment; then one
row per file with its own percent and size, capped by `Files Shown`, and one row
per tracker with its tier, seeders and leechers. "Open downloaded file(s)" only
lists the files that exist on disk under the download directory, and only when
the daemon is local.

## The RPC is not trustworthy about success

Measured against `transmission-daemon 4.1.4` (`rpc-version 19`):

- The daemon answers `409` to the first request and hands out
  `X-Transmission-Session-Id`, which has to be replayed. The extension does that
  once and remembers the value.
- `torrent-add` answers `result: "success"` for an all-zero info hash and creates
  a `status 4` torrent anyway. So `add` re-reads the list and looks for the hash
  instead of believing the answer; if nothing matches, the form says so.
- `torrent-start` and `torrent-stop` with no `ids` at all mean every torrent,
  which is what "Resume All"/"Pause All" send.
- `torrent-set` takes the ids plus only the changed fields; the configuration
  form sends the priority and both limits in one call.
- `uploadRatio` is `-1` before a download happened; that is shown as `—`, not as
  a negative ratio.
- `trackerStats` keeps `-1` counts for a tracker that has never answered, so a
  dead tracker reads `S -1 · L -1` instead of a fake zero.

No client library: the handshake is error handling the views need anyway, and the
whole RPC is six methods.

## What leaves your machine

One `POST /transmission/rpc` per poll to the host you configured. The clipboard
is read locally, and only to prefill the Add form when the text looks like a
magnet, a `.torrent` link or a `.torrent` path.

## Written from scratch

Upstream is `raycast/extensions/extensions/transmission` (`platforms: macOS`):
three commands and 17 files, with 14 runtime dependencies — two of them
(`bytes`, `node-fetch`) unused — for what is string formatting and one poll. The
interface here is this repository's own; see
[`docs/audits/transmission.md`](../docs/audits/transmission.md).
