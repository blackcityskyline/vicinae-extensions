# transmission

Drive a running Transmission daemon: torrents with progress and speeds, start and
stop, add a magnet or a `.torrent`, set per-torrent limits, and open the daemon's
web interface.

| Command | Does |
| --- | --- |
| List Torrents | every torrent, polled every three seconds, with a detail pane |
| Add Torrent | magnet, `.torrent` URL or local path, prefilled from the clipboard |
| Open Web Interface | the daemon's `/transmission/web/` |

## Preferences

`Host` (`localhost`), `Port` (`9091`), `HTTPS`, and a username and password sent
only when the daemon was started with `--auth` (the password is a `password`
preference, not echoed back). The list orders by `Sort Torrents By` in `Sort
Direction`; `Files Shown` caps the detail pane's file rows (0–100, default 20);
`Quick Paths` is a comma-separated list the add form offers, with `~` expanded
before the path reaches the daemon.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Torrent | start / stop | `ctrl+s` |
| Torrent | open downloaded file(s) | `ctrl+o`, `ctrl+1`… for several |
| Torrent | add | `ctrl+n` |
| Torrent | configuration | `ctrl+e` |
| Torrent | copy magnet | `ctrl+shift+c` |
| Torrent | web interface | `ctrl+shift+w` |
| Torrent | refresh | `ctrl+r` |
| Torrent | resume all / pause all | `ctrl+shift+s` / `ctrl+shift+p` |
| Torrent | open download directory | `ctrl+shift+d` |
| Torrent | remove / remove and delete files | `ctrl+x` / `ctrl+shift+x` |
| Add form | add | `ctrl+s` |
| Add form | insert quick path | `ctrl+q`, then `ctrl+1`… |

## The RPC does not report success honestly

Measured against `transmission-daemon 4.1.4` (`rpc-version 19`):

- The first request answers `409` with `X-Transmission-Session-Id`; it is
  replayed once and the value remembered.
- `torrent-add` answers `success` for an all-zero info hash and creates a broken
  torrent anyway, so `add` re-reads the list and looks for the hash.
- `torrent-start` and `torrent-stop` without `ids` mean every torrent, which is
  what Resume All and Pause All send.
- `uploadRatio` is `-1` before any download and shows as `—`; `trackerStats`
  keeps `-1` for a tracker that never answered, shown as is.

No client library: the whole RPC is six methods and the handshake is error
handling the views need. One `POST /transmission/rpc` per poll goes to the
configured host and nothing else; the clipboard is read only to prefill Add.

Written from scratch; upstream's version pulled 14 runtime dependencies for string
formatting and one poll. [`docs/audits/transmission.md`](../docs/audits/transmission.md).
