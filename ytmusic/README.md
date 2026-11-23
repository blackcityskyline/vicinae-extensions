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
- `Play Latest` — plays the last queue again. With the `daemon` backend it resumes
  the same entry at the position where playback stopped, even after the `mpv`
  window was closed or the daemon exited; the `mpv` backend replays the remembered
  queue from its start.

Every list is two panes: rows on the left, the selected row's cover and facts on
the right.

## The backend

Requests and parsing live in `ytmusic-cli`, a JSON bridge over the
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs) crate. The
launcher spawns it per call, writes one `{command, args}` request to stdin and
reads one `{ok, data}` answer; nothing of it is bundled with the extension.

The bridge is a fork of the crate:
[`blackcityskyline/ytmusic-rs`](https://github.com/blackcityskyline/ytmusic-rs),
`~/dev/me/ytmusic-rs` here, upstream `sonorahq/ytmusic-rs`. It carries the
patches the cards draw (playlist description and length, the header's owner and
count) and the binary. Install once:

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

A playlist's length is on its own page; the lengths seen are kept in Vicinae's
`Cache` (keyed by the playlist and its track count), and the saved-playlists
page asks `playlistSummaries` for the first screenful behind the list. A row
with a known length draws its card complete from the first frame; one without
shows the card whole when its page answers, never in two steps. Search and home
rows fill the same way on first open.

## Signing in

No OAuth app: the session is a `Cookie` header — the `Cookies` preference, then
`Cookies File`, then a signed-in browser's store (Firefox, Brave, Chrome,
Chromium, Edge, Vivaldi). With no session, `Browse` opens `music.youtube.com`
once; sign in there, then choose **Read Browser Cookies** on the row.

`Cookies File` defaults to Sonora's `credentials.json`; its live `cookies.json`
is read first. `Auth User` picks the account index. Chromium stores are
encrypted with a keyring password, so without a running keyring they stay
undecryptable; Firefox's is plain.

Cookies are sent as a header only, never logged or written. An expired session
answers as a guest and the client says to sign in again.

## Actions

Actions: play, play next, queue, like, playlist, MP3 download, open album or
artist, browser, copy link. Albums and playlists: play all, shuffle, download
all, save. Artists: top songs, albums, singles, full discography. Now Playing
drives the shared `mpv` IPC socket.

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

`ytmusic-cli` (above), `mpv` (or the configured player) with its yt-dlp hook,
`yt-dlp` for downloads, `ffmpeg` for MP3. `mpv` runs once with
`--input-ipc-server=$XDG_RUNTIME_DIR/vicinae-ytmusic.sock`; a non-`mpv` player
is spawned detached and the queue actions are hidden.

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
