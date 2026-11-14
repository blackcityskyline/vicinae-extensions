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
| Player | `mpv` |
| Player Arguments | empty |
| Show the Player Window | off |
| Download Folder | `~/Music/YouTube Music` |

## Requirements

`mpv` (or the configured player) with its yt-dlp hook, `yt-dlp` for downloads
and `ffmpeg` for MP3. `mpv` runs once with
`--input-ipc-server=$XDG_RUNTIME_DIR/vicinae-ytmusic.sock`; a non-`mpv` player is
spawned detached and the queue actions are hidden.

## Privacy

Requests go to `music.youtube.com` and `www.youtube.com/sw.js_data`; a signed-in
one carries the configured cookies from memory. No API key, no telemetry. The
player and `yt-dlp` contact YouTube for the media.

## Not verified

The read endpoints were called headless with a real session and the main-menu
previews rendered; no row was pressed, so play, queue, like, add-to-playlist,
download and the discography walk are covered only by tests. Signed-in browser
cookies were tested against synthetic stores, not a real profile.

The models and parsers are a TypeScript port of
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs), GPL-3.0-or-later,
following Sonora's cookie sign-in. See
[`docs/audits/ytmusic.md`](../docs/audits/ytmusic.md).
