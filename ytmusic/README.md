# YouTube Music

A launcher front end for YouTube Music's own web pages: `Home`, `Charts`, `Moods & Genres`,
search with filters, album, artist, playlist and discography pages, and — with cookies — the
library, play history and liked songs. Playing and downloading go through `mpv` and `yt-dlp`.

## Commands

- `Browse YouTube Music` — search as you type, browse the shelves, open the library.
- `Now Playing` — the current cover and title, pause/resume, skip, go back, shuffle, repeat and
  stop the shared `mpv`.

With an empty search bar `Browse` lists `Now Playing`, the `Library` (when signed in) and the
browse pages. A `List.Dropdown` in the search bar limits a search to `Songs`, `Videos`, `Albums`,
`Artists` or `Playlists`; `All` keeps the grouped answer.

Every list is two panes: titles on the left, and on the right the selected row's cover, its
title, its artist and the facts the row does not show. The main menu goes further: a page row
previews what the page holds — covers, titles and artists — in the detail pane's metadata rows,
loaded only once that row is selected.

Downloads and a non-`mpv` player are anonymous: the cookies stay in this process and are not
handed to `yt-dlp` or `Player`, so `Download All` on a private playlist can be refused. `Play All`
avoids that by queueing the public song ids in `mpv`.

## Signing in

YouTube Music has no OAuth application: Google's OAuth tokens only open the public YouTube Data
API, which has no library, history or playback. Sonora, the player this extension's parsers come
from, signs its YouTube Music account in with a pasted `Cookie` header and `SAPISIDHASH`
(`crates/music/src/youtube/auth.rs`); it only uses OAuth for Spotify and Tidal. This extension
does the same.

The session is read, in this order, from:

1. the `Cookies` preference (a pasted `Cookie` header);
2. `Cookies File` (Sonora's stored session, if it exists);
3. the cookie store of a signed-in browser — Firefox, Brave, Chrome, Chromium, Edge or Vivaldi.

With no saved session, `Browse` opens `music.youtube.com` once and remembers that it did
(`$XDG_CACHE_HOME/ytmusic/sign-in-opened`). Sign in there, then pick **Read Browser Cookies** on
the `Sign in to YouTube Music` row; running the command again reads it automatically.

Sonora is optional: the default `Cookies File` is its
`~/.local/share/sonora/accounts/youtube/credentials.json`, and because Sonora rotates the session
into `cookies.json` beside it, the extension reads that live store first and only falls back to
the header inside `credentials.json` (which goes stale). A file that is not there is skipped.
`Auth User` picks the Google account index when a browser is signed into several.

Chromium-family cookies are encrypted with a keyring password. When no keyring is reachable (a
bare session with no GNOME Keyring or KWallet), those values cannot be decrypted and the row
stays a guest; Firefox's store is unencrypted and always readable, and a pasted header always
works.

Cookies stay in this process: they are sent as the `Cookie` header, never logged and never
written by the extension. An expired session answers as a guest, which the client turns into
`YouTube Music did not accept the cookies: sign in again.` There is no cookie rotation: Google
refreshes `__Secure-3PSIDTS` while a browser tab is open, so a pasted session eventually expires
and has to be read or pasted again.

## Actions

| Where | Action | What it does |
| --- | --- | --- |
| Song | Play | The shared `mpv`, and the song is added to the local `Recently played` list |
| Song | Play Next, Add to Queue | The `mpv` queue; mpv only |
| Song | Like | `like/like` on the signed-in account |
| Song | Add to Playlist | Picks one of the saved playlists and appends the song |
| Song | Download Audio | A detached `yt-dlp` MP3 under the download folder, in a folder named after the artist |
| Album | Play All | The album's tracks queued in `mpv` by song id; another player gets the `OLAK5uy_…` URL |
| Album | Shuffle Play | The same queue in a random order |
| Album | Download All | A detached `yt-dlp` on the album's `OLAK5uy_…` playlist |
| Album, Playlist | Save | `like/like` on the signed-in account |
| Playlist | Play All | Every loaded track queued in `mpv` by song id (a private playlist's URL would need the cookies) |
| Playlist | Shuffle Play | Every loaded track in a random order |
| Playlist | Download All | Every track of the playlist, in one numbered folder |
| Now Playing | Pause, Next, Previous | `cycle pause`, `playlist-next`, `playlist-prev` on the shared `mpv` |
| Now Playing | Queue row | Switches playback to that entry: `playlist-pos` |
| Now Playing | Volume | Increase/Decrease (±5%), `Set Volume…` (0–130%), `Mute`/`Unmute`; the current percentage is on the row |
| Now Playing | Shuffle | mpv's `shuffle` property; the queue reorders in place |
| Now Playing | Repeat | Off → All → One: `loop-playlist` and `loop-file` |
| Any row | Open in YouTube Music, Copy URL | The link |

An album opens its header (kind, artist, year, track count), its description and its tracks. A
playlist opens and follows its continuations, so `Next page` keeps loading. An artist opens its
top songs, albums and singles, and `All releases` walks the discography page by page. A mood,
genre, podcast, profile or chart card opens the shelves that page renders.

The library pages follow their `gridContinuation` rows: `History` (`FEmusic_history`), `Liked
songs` (`LM`), `Albums` (`FEmusic_liked_albums`), `Artists`
(`FEmusic_library_corpus_track_artists`), `Playlists` (`FEmusic_liked_playlists`) and
`Subscriptions` (`FEmusic_library_corpus_artists`).

`Recently played` is local: it lives in `$XDG_CACHE_HOME/ytmusic/history.json` (50 rows, newest
first, one row per song), so deleting the cache deletes it. `History` is the server's list. The
Now Playing queue is read from `mpv`, which only knows URLs, so the titles and covers of queued
songs are remembered in `$XDG_CACHE_HOME/ytmusic/queue.json` (500 rows, one per video id).

## Preferences

| Preference | Default | Used for |
| --- | --- | --- |
| `Cookies` | empty | The signed-in `Cookie` header; empty browses as a guest |
| `Cookies File` | Sonora's `credentials.json` | Read when `Cookies` is empty |
| `Auth User` | `0` | `X-Goog-AuthUser`, for a browser signed into several accounts |
| `Player` | `mpv` | The `Play` command; `mpv` gets the IPC socket and the queue |
| `Player Arguments` | empty | Extra player arguments, split like a shell splits them |
| `Show the Player Window` | off | `mpv` plays headless; on, it opens its own window |
| `Download Folder` | `~/Music/YouTube Music` | Where the MP3s go; `~` is expanded |

## Requirements

- `mpv`, or whatever `Player` names; it must resolve YouTube URLs through its own yt-dlp hook
- `yt-dlp` in `PATH` for downloads
- `ffmpeg` for MP3 conversion

`mpv` is started once with `--idle=yes --input-ipc-server=$XDG_RUNTIME_DIR/vicinae-ytmusic.sock`;
headless it also gets `--force-window=no --no-video`, and with `Show the Player Window` on it gets
`--force-window=yes` instead. Every later command talks to that one instance over JSON IPC, and
changing the window preference restarts it on the next play. A non-`mpv` player is spawned
detached, and the queue, shuffle and repeat actions are hidden.

## Privacy

The extension contacts `music.youtube.com` and `www.youtube.com/sw.js_data` directly. A guest
request is anonymous; a signed-in one sends the cookies you configured or that it read from your
browser's cookie store — in memory only, nothing written. No API key, no telemetry. The player
and `yt-dlp` contact YouTube for the media itself.

## Not verified

- The launcher's own panes were captured with `grim` after `hyprctl layers` gave the surface
  geometry: with `Now Playing`, `Subscriptions`, `Playlists` and `Artists` selected in the main
  menu, the description sat above and the preview rows below, each with a 14×14 cover icon, a
  title and a kind or artist. Other pages, forms and the action panels were not inspected.
- The read endpoints were called headless with a real session: `FEmusic_history` returned three
  shelves, the album grid seven items, the liked playlist 100 tracks plus a continuation, the
  artist grid 169, the playlist grid 217 and the subscription grid 10. The write calls
  (`like/*`, `browse/edit_playlist`) were not sent from the launcher; their request shape is
  ported from `ytmusic-rs` and asserted in tests.
- No row was clicked in the launcher. Play, queue, like, add-to-playlist, download, the
  discography walk and the opening of `Now Playing` were not pressed; their argv, headers and
  pages are asserted in `test/music.test.ts`.
- The `mpv` controls were driven over its IPC socket from outside the launcher: state polling
  (title, path, position, queue position), `repeat` cycling off → all → one, the `shuffle`
  toggle, the headless/window restart, `playlist-pos` jumping inside a three-song queue, and
  `volume`/`mute` (100 → 105 → 42, muted and back) all answered; the cover URL derived from
  `path` answered HTTP 200. The same calls from the launcher's action panel were not pressed.
- The main-menu previews were called headless with a real session: `Home`, `History`, `Liked
  songs`, `Albums`, `Artists`, `Playlists`, `Subscriptions`, `Moods & Genres` and `Charts` each
  returned rows with titles, artists and covers, and a `grim` capture of the launcher showed the
  `Artists`, `Playlists` and `Subscriptions` previews rendered with their labels, kinds and cover
  icons. Whether the detail pane is mounted only for the selected row was not measured.
- The browser sign-in was tested against synthetic Firefox and Chromium stores (surviving and
  expired cookies, `v11` values, a wrapped key), not against a real signed-in browser: this
  machine's Brave store has no reachable keyring, so its `v11` values stay undecryptable. A
  signed-in Firefox profile is the unencrypted path that was read end to end.

## Attribution

The models and parsers are a TypeScript port of
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs), GPL-3.0-or-later; the ported
files keep the crate's function and type names. The cookie sign-in follows
[`sonorahq/sonora`](https://github.com/sonorahq/sonora)'s `youtube/auth.rs`. See
[`docs/audits/ytmusic.md`](../docs/audits/ytmusic.md).
