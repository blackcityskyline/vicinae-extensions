# transmission

Drive a running Transmission daemon: list torrents with their progress and
speeds, start and stop them, add a magnet link or a `.torrent` file, and open the
daemon's own web interface.

| Command | What it does |
| --- | --- |
| List Torrents | Every torrent, polled every three seconds, with a detail pane |
| Add Torrent | A form for a magnet, a `.torrent` URL or a local `.torrent` path |
| Open Web Interface | Opens the daemon's `/transmission/web/` in the browser |

## Preferences

`Host` (default `localhost`), `Port` (default `9091`), `HTTPS`, and a username
and password that are only sent when the daemon was started with `--auth`. The
password is a `password` preference, so it is not echoed back into the form.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Torrent | Start or stop | `ctrl+s` |
| Torrent | Add Torrent | `ctrl+n` (`new`) |
| Torrent | Copy Magnet Link | `ctrl+shift+c` (`copy`) |
| Torrent | Open Web Interface | `ctrl+o` (`open`) |
| Torrent | Refresh | `ctrl+r` (`refresh`) |
| Torrent | Open Download Directory | `ctrl+shift+o` |
| Torrent | Remove Torrent | `ctrl+x` (`remove`) |
| Torrent | Remove Torrent and Delete Files | `ctrl+shift+x` (`remove-all`) |
| Add form | Add Torrent | `ctrl+s` (`save`) |

The named keys follow the user's `keybinds`; the literal ones are this
extension's own verbs.

## The RPC is not trustworthy about success

Measured against `transmission-daemon 4.1.4` (`rpc-version 19`):

- The daemon answers `409` to the first request and hands out
  `X-Transmission-Session-Id`, which has to be replayed. The extension does that
  once and remembers the value.
- `torrent-add` answers `result: "success"` for an all-zero info hash and creates
  a `status 4` torrent anyway. So `add` re-reads the list and looks for the hash
  instead of believing the answer; if nothing matches, the form says so.
- `uploadRatio` is `-1` before a download happened; that is shown as `—`, not as
  a negative ratio.

No client library: the handshake is error handling the views need anyway, and the
whole RPC is four methods.

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
