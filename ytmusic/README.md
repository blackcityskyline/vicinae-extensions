# YouTube Music

A launcher front end for YouTube Music's own web pages: Home, Charts, Moods &
Genres, search with filters, album, artist, playlist and discography pages, and
with cookies the library, history and liked songs. Playback and downloads go
through `mpv` and `yt-dlp`.

## Commands

- `Browse YouTube Music` — search as you type, browse the shelves, open the
  library. An empty search bar lists Now Playing, the Library and the pages; a
  dropdown limits search to Songs, Videos, Albums, Artists or Playlists.
- `Now Playing` — cover, title, pause, skip, back, volume, shuffle, repeat, stop
  and the queue of the shared `mpv`.

Every list is two panes: rows on the left, the selected row's cover and facts on
the right.

## The backend

Every request and its parsing live in `ytmusic-cli`, a JSON bridge over the
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs) crate. The
launcher spawns it once per call, writes one `{command, args}` request to its
stdin and reads one `{ok, data}` answer; no part of it is bundled with the
extension.

The bridge is its own repository, a fork of the crate:
[`blackcityskyline/ytmusic-rs`](https://github.com/blackcityskyline/ytmusic-rs),
`~/dev/me/ytmusic-rs` on this machine, with `sonorahq/ytmusic-rs` as its
`upstream` remote. It carries the patches the cards draw (playlist description
and length, the header's owner and count) and the binary on top of them. Install
it into the system once:

```bash
cd ~/dev/me/ytmusic-rs && cargo install --path . --bin ytmusic-cli
```

`~/.cargo/bin/ytmusic-cli` and `/usr/local/bin/ytmusic-cli` are tried after
`ytmusic-cli` on `PATH`, because a launcher started by the compositor does not
always have `~/.cargo/bin` on its path. `YTMUSIC_BINARY` overrides the name or
the path.

The session travels in the environment, never in `argv`: `YTMUSIC_COOKIES` (the
`Cookie` header), `YTMUSIC_AUTHUSER` (the account index) and `YTMUSIC_CACHE`
(the player cache directory, default `$XDG_CACHE_HOME/ytmusic`).

A playlist's length is only on its own page, so a card that waited for that page
would grow a `Duration` row a second after it was drawn. The lengths seen are
kept in Vicinae's `Cache`, keyed by the playlist and its track count, and the
saved-playlists page asks `playlistSummaries` for the first screenful behind its
list. A row whose length is known draws its card complete from the first frame;
one without it shows the card whole when its page answers, never in two steps.
Search and home rows are filled the same way the first time they are opened.

## Signing in

YouTube Music has no OAuth application, so the session is a `Cookie` header,
read from the `Cookies` preference, then `Cookies File`, then a signed-in
browser's cookie store (Firefox, Brave, Chrome, Chromium, Edge, Vivaldi). With no
session, `Browse` opens `music.youtube.com` once; sign in there, then choose
**Read Browser Cookies** on the row.

`Cookies File` defaults to Sonora's `credentials.json`; its live `cookies.json`
is read first when present. `Auth User` picks the account index. Chromium stores
are encrypted with a keyring password, so without a running keyring those values
stay undecryptable; Firefox's store is plain and always readable.

Cookies are sent as a header only, never logged or written. An expired session
answers as a guest and the client says to sign in again.

## Actions

Songs play, play next, queue, like, add to a playlist, download MP3, open the
album or artist, open in the browser, copy the link. Albums and playlists play
all, shuffle, download all and save; artists open top songs, albums, singles and
the full discography. Now Playing controls the shared `mpv` over its IPC socket.

`Recently played` is local: `$XDG_CACHE_HOME/ytmusic/history.json`, 50 rows.
The queue's titles and covers live in `queue.json`, 500 rows.

## Preferences

| Preference | Default |
| --- | --- |
| Cookies | empty (guest) |
| Cookies File | Sonora's `credentials.json` |
| Auth User | `0` |
| Playback Backend | `mpv` (launcher-owned) |
| Daemon Command | `ytmusicd` |
| Player | `mpv` |
| Player Arguments | empty |
| Show the Player Window | off |
| Download Folder | `~/Music/YouTube Music` |

## Requirements

`ytmusic-cli`, installed as above. `mpv` (or the configured player) with its
yt-dlp hook, `yt-dlp` for downloads and `ffmpeg` for MP3. `mpv` runs once with
`--input-ipc-server=$XDG_RUNTIME_DIR/vicinae-ytmusic.sock`; a non-`mpv` player is
spawned detached and the queue actions are hidden.

## Playback backends

`mpv` (default): the launcher starts and drives its own `mpv`, as above.

`ytmusicd`: the launcher becomes a client of the `ytmusicd` daemon from
[ytmusic-rs](https://github.com/blackcityskyline/ytmusic-rs) (`docs/protocol.md` there). The
queue, position, volume, shuffle and repeat live in the daemon, so a terminal client or
`ytmusicctl` sees and controls the same playback. The launcher starts the daemon if none
answers (cookies go in its environment, never its arguments), and the daemon exits by itself
after a quiet period. Needs `ytmusicd` on the `PATH` (or set Daemon Command). Volume is 0-100
in this mode; the queue is listed in insertion order, not shuffle order. The daemon's output
(`mpv` or the in-process `native` one) is chosen when the daemon starts, not here.

## Privacy

`ytmusic-cli` calls `music.youtube.com` and `www.youtube.com/sw.js_data`; a
signed-in one carries the configured cookies from the environment. No API key,
no telemetry. The player and `yt-dlp` contact YouTube for the media.

## Not verified

The read commands were called headless against a guest session and their pages
rendered: search, a public playlist page with its author, length and
description, and the signed-in Playlists page with its preview card. Play,
queue, like, add-to-playlist, download and the discography walk are covered only
by tests. Signed-in browser cookies were tested against synthetic stores, not a
real profile.

The models and parsers are
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs), GPL-3.0-or-later,
followed through `ytmusic-cli`; the page previews and the player side are the
extension's own.
