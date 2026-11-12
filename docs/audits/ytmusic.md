# ytmusic

YouTube Music's web pages as launcher lists, measured and ported from `sonorahq/ytmusic-rs`.
This extension was split out of `yt-x` once the music views outgrew "the yt-x menus": it shares
no code with it and has its own command and preferences.

## Why the port

yt-x has no music views, and yt-dlp cannot list the music service's shelves:
`music.youtube.com` redirects to `youtube.com`, and `music.youtube.com/search` is the only
music page it knows. The home, chart, mood, genre, album, artist and playlist pages are rendered
by an anonymous `WEB_REMIX` InnerTube client, so the extension calls
`music.youtube.com/youtubei/v1/{browse,search}` itself and parses the answers.

The models and parsers are a TypeScript port of
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs) (GPL-3.0-or-later, cloned at
`HEAD` on 2026-11-11, ~180 KB of Rust):

| Their file | Ported to | Kept |
| --- | --- | --- |
| `nav.rs` | `src/utils/ytmusic.ts` | `at`, `strAt`, `itemsAt`, `runText`, `runsAt`, `findRenderer`, `findRenderers` |
| `util.rs` | `src/utils/ytmusic.ts` | `parseClock`, `parseYear` |
| `models.rs`, `parse.rs` | `src/utils/ytmusic.ts` | `Track`, `Album`, `Artist`, `Playlist`, `listItemTrack`, `twoRowAlbum`, `twoRowPlaylist`, `listItemAlbum`, `listItemPlaylist`, `countFromText`, `shelfContinuation` |
| `client.rs`, `context.rs` | `src/api/ytmusic.ts` | `execute`, the WEB_REMIX context and headers, the visitor id, the `SAPISIDHASH` headers |
| `browse.rs`, `search.rs` | `src/api/ytmusic.ts` | `album`, `artist`, `discography`, `playlistPage`, `playlistContinuation`, `search`, the search filter `params` |
| `library.rs` | `src/api/ytmusic.ts` | `musicLibraryItems`, the liked/album/artist/playlist/subscription browse ids, `LIKED_SONGS` |
| `mutate.rs` | `src/api/ytmusic.ts` | `likeTrack`, `likePlaylist`, `addTrackToPlaylist` |

Not ported: `player.rs`, `stream.rs`, `deobf.rs`, `potoken.rs`, `radio.rs`, `dedup.rs` and the
account switcher (`account/accounts_list`, `identity`). `mpv` and `yt-dlp` play and download;
`History` is read from `FEmusic_history` rather than the crate's absent model. The crate's
`musicPlaylist` (walk every continuation) was dropped because the playlist view loads
continuations one page at a time.

The home, chart, mood and genre shelves have no model in the crate and keep this repository's
own generic shelf reader in the same file.

## Measurements

| Fact | Measurement |
| --- | --- |
| Endpoint | `POST https://music.youtube.com/youtubei/v1/browse?prettyPrint=false&alt=json`, same for `/search` |
| Context | the crate's: `clientName: "WEB_REMIX"`, `clientVersion: "1.20260707.12.00"`, `hl`, `gl`, `visitorData`, `originalUrl`, Chrome UA, `isAudioOnly: true` |
| Visitor id | `GET https://www.youtube.com/sw.js_data` with the visionOS UA, `200` in 0.2 s; the id is the first `"Cg…"` string and is reused for the life of the worker |
| API key | not needed: the same `browse` call answered `200` with the public web key and without any key |
| Cookies | none for guest browsing; a pasted session adds `Cookie`, `Authorization: SAPISIDHASH …`, `X-Origin`, `X-Goog-AuthUser` and drops `X-Goog-Visitor-Id` |
| Search with a filter | live `search` for `daft punk`: songs `Songs:20`, videos `Videos:20`, albums `Albums:20`, artists `Artists:10`, playlists `Community playlists:20` |
| Search filter params | songs `EgWKAQIIAWoMEA4QChADEAQQCRAF`, videos `EgWKAQIQAWoMEA4QChADEAQQCRAF`, albums `EgWKAQIYAWoMEA4QChADEAQQCRAF`, artists `EgWKAQIgAWoMEA4QChADEAQQCRAF`, playlists `EgWKAQIoAWoMEA4QChADEAQQCRAF` (decoded: `EgWKAQ` + type byte + `AWoMEA4QChADEAQQCRAF`) |
| Home, anonymous | 2–3 shelves per call: `Quick picks` (20 song rows), `New releases` (10 album cards), sometimes `All hits` (10 playlist cards) |
| Charts (`FEmusic_charts`) | `Video charts` (2 playlist cards), `Top artists` (40 artist cards), plus one empty untitled shelf that the parser drops |
| Moods & genres | two grids, 37 buttons (`Moods & moments`, `Genres`), each a browse id plus params |
| A mood page (`Chill`) | 8 shelves: `Unwind + explore`, `Mindfulness & meditation`, `Chilled`, `Yoga`, `Peaceful bedtime`, `Laidback + acoustic`, `Deep grooves`, `Chill pop` |
| A genre page (`Soundtracks & musicals`) | `Songs`, `Featured playlists`, `Community playlists`, `Music videos`, `Albums` |
| An artist page | 8 shelves for Alka Yagnik: `Top songs` (5), `Albums` (10), `Singles & EPs` (10), `Videos` (5 songs + 5 cards), `Live performances` (3), `Featured on` (10), `Playlists by …` (4), `Fans might also like` (10) |
| Search | a flat list of `itemSectionRenderer`s with no titles; the port groups them into `Songs`, `Albums`, `Artists`, `Playlists`, `Podcasts`, `Profiles`, `Genres`, `Pages` |

What yt-dlp makes of the same addresses:

| URL | yt-dlp |
| --- | --- |
| `music.youtube.com/browse/MPREb_…` (album) | redirects to `youtube.com/playlist?list=OLAK5uy_…`, lists the album's tracks |
| `music.youtube.com/browse/VL…` (playlist) | the playlist itself, e.g. 100 tracks |
| `music.youtube.com/browse/UC…` (artist) | redirects to `…/channel/UC…/videos`, which is empty for a `… - Topic` artist channel (measured on Alka Yagnik and The Weeknd) |

That measurement is why an artist is never handed to yt-dlp. Albums, playlists and discographies
are read from the API instead, because the port already parses them and yt-dlp would answer with
the same list one page at a time.

Reading the answer, as the port does it: a row's title is its first flex column; its artists are
the runs whose `browseId` starts with `UC`; its album is the run whose id starts with `MPR`; its
length is the fixed column, or the last `3:21`-shaped run; its id is `playlistItemData.videoId`,
the title's watch endpoint, or the play overlay. Shelves come from
`musicCarouselShelfRenderer`, `musicShelfRenderer`, `gridRenderer` (moods and genres) and
`musicNavigationButtonRenderer`; rows outside a shelf are grouped by kind; an empty shelf is
dropped. An album header gives kind, year, artists, track count and its `OLAK5uy_…` playlist id;
an artist header gives the name, description and subscriber count; the `MPAD{channel}` page
gives the discography, followed through `gridContinuation` up to 50 pages.

Runtime check inside the worker: `v26.13.0`, with `fetch` and `AbortSignal.timeout` present; a
`browse` of `FEmusic_home` from the extension logged 2 shelves (`Quick picks:20,
New releases:10`), and an album page came back with `А вокруг туман`, 1 track, 227 s.

## Sign-in, and why there is no OAuth

`grep -rni oauth` over `sonorahq/sonora`'s `crates/music/src` names only
`spotify/auth.rs` and `tidal/auth.rs`: the PKCE client is used for those two providers. YouTube
Music signs in with cookies:

- `youtube/auth.rs` normalises a pasted `Cookie` header to `name=value` pairs and refuses one
  without `SAPISID` or `__Secure-3PAPISID`.
- `youtube/mod.rs` saves `{"kind":"cookies","cookies":…,"authuser":N,"page_id":…}` under
  `$XDG_DATA_HOME/sonora/accounts/youtube/credentials.json` (the earlier guess,
  `…/sonora/credentials/youtube/`, is wrong; `cookies.json` beside it is the rotated cookie
  store).
- `ytmusic-rs`'s `client.rs` sends `Authorization: SAPISIDHASH <ts>_<sha1("<ts> <SAPISID>
  https://music.youtube.com")>`, `X-Origin`, `X-Goog-AuthUser` and the `Cookie` header, and
  sends no visitor id. It keeps `X-Goog-PageId` optional, for the account switcher this port
  does not implement.

Measured on the owner's account: `credentials.json` held 11 pairs and its header had gone stale
(`logged_in: 0`, the "did not accept the cookies" toast), while `cookies.json` beside it held 19
live pairs for `youtube.com`. The port therefore prefers the rotated store and falls back to the
`credentials.json` header; both shapes sign in, and `cookies.json` named directly works too.

The hash vector: `timestamp=1700000000`, `SAPISID=ABC123` →
`1700000000_140ae8acb03af0c5759adfcca786de9ab339fa31`, reproduced with
`printf '%s' '1700000000 ABC123 https://music.youtube.com' | openssl dgst -sha1`.

Google's OAuth cannot replace this: the `youtube` scope opens the public YouTube Data API v3,
which has no music library, history or playback. A real `FEmusic_history` request with a bogus
`SAPISID` answered **HTTP 200**, `logged_in: 0`, and a fresh `visitorData` — an expired session is
served as a guest rather than rejected. The port therefore checks `responseContext
.serviceTrackingParams` for `GFEEDBACK/logged_in=0` when a session is configured and throws
`YouTube Music did not accept the cookies: sign in again.` instead of showing an empty library.

## Reading cookies from a browser

A machine without Sonora has no stored session, so `src/api/browser.ts` reads the browser's own
cookie store: Firefox's `cookies.sqlite` (plain values) and the Chromium family's `Cookies`
database (Brave, Chrome, Chromium, Edge, Vivaldi).

- Firefox is tried first, then the Chromium browsers; profiles are ordered by the database's
  mtime, and the first store with a non-expired `SAPISID`/`__Secure-3PAPISID` wins. Cookie
  domains are restricted to `youtube.com` and its subdomains; a zero expiry counts as a session
  cookie.
- Chromium's Linux format is `v10`/`v11` + AES-128-CBC with a sixteen-space IV. The key is
  `PBKDF2(secret-tool lookup application <browser>, "saltysalt", 1, 16, SHA-1)`, or the key
  wrapped in `Local State`'s `os_crypt.encrypted_key`; without a reachable keyring the password
  is the well-known `peanuts`. `v20` values are app-bound and are skipped.
- On this machine Brave is signed in (`SAPISID` present in its `Cookies` database as `v11`), but
  `secret-tool lookup application brave` exits 1 and its `Local State` has no `os_crypt` key, so
  those values cannot be decrypted here: the port reports a guest instead of a wrong header.
- The SQLite read uses Node's built-in `node:sqlite` (Node 22.5+), loaded through
  `createRequire` and disabled when it is missing: an older launcher keeps the pasted and Sonora
  paths instead of failing to load the extension.
- Firefox values are unencrypted, and the Firefox path was read end to end from a synthetic
  profile. Chromium's decrypt was tested by writing `v11` values and a wrapped key with Node's
  AES in the test, not by a real keyring.

`loadAuth` order is: pasted `Cookies`, then `Cookies File`, then the browser store. A missing
Sonora file is skipped; a file whose cookies carry no proof falls through to the browser. The
read is synchronous and in memory: nothing is written, and the header is never logged.

When no session is found at all, `Browse` opens `music.youtube.com` once and writes the marker
`$XDG_CACHE_HOME/ytmusic/sign-in-opened`, so it does not keep stealing focus on later launches.
The `Sign in to YouTube Music` row's `Read Browser Cookies` action re-runs `loadAuth` without a
relaunch.

## Playback, queue and history

`src/api/player.ts`, not a port: `Play` starts one detached `mpv` per user with
`--idle=yes --force-window=no --no-video --no-terminal
--input-ipc-server=$XDG_RUNTIME_DIR/vicinae-ytmusic.sock`, then `src/api/mpv.ts` sends
`loadfile <url> replace` over the socket. `Play Next` and `Add to Queue` use
`append-play`/`append`; `Play All` sends `loadfile <song> replace` followed by one `append` per
track, because a signed-in playlist URL would need the cookies that yt-dlp does not get.

`Shuffle Play` is the same queue with the ids Fisher–Yates shuffled in the extension
(`src/api/mpv.ts`'s `shuffled`), so the first song is already random and mpv needs no property.
`Now Playing` toggles mpv's own `shuffle` property and cycles `repeat` through
`loop-playlist=inf` / `loop-file=inf`, measured on mpv v0.41.0: the properties read back as
`false`, `"inf"` or `"no"`, and setting `shuffle` on an idle instance is accepted. `Now Playing`
polls `media-title`, `path`, `pause`, `time-pos`, `duration`, `playlist-pos`, `playlist-count`,
`playlist`, `volume`, `mute`, `idle-active`, `shuffle`, `loop-playlist` and `loop-file` once a
second while its view is open, and sends `cycle pause`, `playlist-next`, `playlist-prev`, `stop`
or `quit`. The interval is cleared when the view unmounts, so a closed launcher leaves mpv alone.

The queue in that list is mpv's `playlist` property, which carries only each entry's `filename`
(the URL). `src/api/queue.ts` keeps the matching titles, artists and covers in
`$XDG_CACHE_HOME/ytmusic/queue.json` (one row per video id, newest first, capped at 500),
written whenever Browse starts or extends a queue and replaced through a temporary rename. A
queue row's `Play This Track` sets `playlist-pos`, measured on mpv v0.41.0: after `jump(1)` on a
three-song queue, `playlist-pos` read back as 1 and `path` was the second URL. The local history
and this cache are skipped only when the cache folder cannot be written; playback still starts.

Volume is mpv's `volume`/`mute`, with the same shape as `audio-control`: `Increase Volume (+5%)`
and `Decrease Volume (-5%)`, `Set Volume…` (a form clamped to 0–130, mpv's default ceiling) and
`Mute`/`Unmute`, plus the current percentage on the Now Playing row. Measured over IPC:
`100 → 105` after the increase, `42` after `setVolume`, and `mute` toggled both ways.

The cover is not stored: mpv's `path` is the watch URL, its `v` is the video id, and
`https://i.ytimg.com/vi/<id>/hqdefault.jpg` answered HTTP 200 for a public song. A player other
than `mpv` is spawned detached with `playerArgs`, and the queue, shuffle and repeat actions are
hidden.

Headless is the default (`--force-window=no --no-video`). The `playerWindow` preference swaps
those for `--force-window=yes`; `ensureServer` reads `options/force-window` over IPC and quits and
restarts mpv when the running instance was started in the other mode.

`Recently played` is local: `src/api/history.ts` writes
`$XDG_CACHE_HOME/ytmusic/history.json` through a temporary file and a rename, newest first,
deduplicated by `videoId`, capped at 50. `History` is the server's `FEmusic_history`.

Downloads spawn a detached `yt-dlp` with `--extract-audio --audio-format mp3` and an output
template. A single song lands in `<download folder>/<artist>/<title>.<ext>`; an album or playlist
in `<download folder>/<title>/<index> - <title>.<ext>`. A slash in the playlist title becomes
`_`. No archive, no `--download-archive`: pressing Download All twice downloads twice. The
cookies never leave the extension process, so `yt-dlp` downloads anonymously and a private
playlist can refuse; `Play All` sidesteps that by queueing song ids.

Preferences are the manifest's: `cookies`, `cookiesFile` (Sonora's `credentials.json`),
`authUser` (`0`), `player` (`mpv`), `playerArgs` (shell-split by `src/utils/shell-words.ts`),
`playerWindow` (`false`: headless) and `downloadDir` (`~/Music/YouTube Music`, `~` expanded).

## Main-menu previews

`src/api/preview.ts` fetches the selected main-menu row's page only when its `List.Item.Detail`
mounts — selecting the row, not opening the command — and renders up to six rows with covers,
titles and a kind or artist in the detail pane's metadata section, under the description.
The loaders reuse the same client as the pages: `FEmusic_home`, `FEmusic_moods_and_genres`,
`FEmusic_charts`, `FEmusic_history`, `LM` (Liked songs) and the album/artist/playlist/
subscription library browse ids. Shelf titles become the subtitle, so a Home preview says which
shelf a row came from. A row never has an empty value: a library artist's own page type is the
generic `page`, so each library loader names its kind (`Album`, `Artist`, `Playlist`).

Vicinae 0.30's `DetailPanel.qml` stacks the markdown content above a `MetadataBar` that takes at
most 40% of the pane's height, so the preview rows sit under the description, not beside it.
Cover size is fixed by `MetadataBar.qml`: every row icon is 14×14. A larger cover can only be a
markdown image block, and `markdown-model.cpp` splits every image out of its paragraph into its
own centred block, so covers in the markdown pane cannot line up with rows.

A page preview is cached per command process in a module-level `Map` keyed by the page, so
moving the selection back and forth does not refetch, and a failed load evicts itself for a
retry. `Now Playing` is the exception: it is loaded live from mpv and the queue cache each time
the row is selected, because the point of the preview is what is playing now. Nothing is
cached across launcher runs, and nothing polls while the selection sits still.

## Verification

- `npm run lint`, `npm run check`, `npm test` (28 checks), `npm run build` — all pass.
- `test/music.test.ts` covers the crate's own `parseClock`/`parseYear`/`countFromText` cases,
  the real home/genre/search answers (shelves, album and playlist cards, genre params, grouping,
  the dropped empty shelf), three real page answers replayed through the client (album header
  and track duration, a playlist with its tracks, an artist with top songs/albums/singles), the
  player/download argv including the headless and window flags, the shuffle permutation and the
  repeat cycle, the cover URL and video-id parsing, and the signed-in half: the cookie
  normaliser, `SAPISIDHASH` against Google's vector, Sonora's `credentials.json`, its rotated
  `cookies.json` beating a stale header, guest files, synthetic Firefox and Chromium stores
  (expired rows dropped, `v11` decrypted, a wrapped key), a continuation page, the 50-row
  history, a signed-in search's headers and `params`, a rejected cookie, and the library's
  refusal to ask anonymously.
- `mpv v0.41.0` and `socat` are installed, and the socket was driven outside the launcher:
  playing two ids answered `repeat: off → all → one → off` and `shuffle: false → true → false`,
  `path` yielded the cover URL (HTTP 200), and switching `playerWindow` restarted the player with
  `options/force-window` true and then false. The same IPC calls from the action panel were not
  pressed.
- Installed with `npm run build`; launching `@black/ytmusic/browse` and
  `@black/ytmusic/now-playing` logs `Loaded extension …` and `Started extension …` with no error
  after.

## Not verified

- The launcher's own panes were captured with `grim` after `hyprctl layers` gave the surface
  geometry: the main menu with `Now Playing`, `Subscriptions`, `Playlists` and `Artists` selected
  showed the description above the metadata rows, each row with its cover icon, title and kind.
  Other pages, forms and action panels were not inspected.
- The account's read endpoints were exercised headless, not from the launcher: with the live
  Sonora session `FEmusic_history` gave `Last week:1, October 2026:164, September 2026:33`, the
  album grid 7 items, `LM` 100 tracks plus a continuation, artists 169, playlists 217 (216 without
  `LM`), subscriptions 10. The write calls (`like/like`, `like/removelike`,
  `browse/edit_playlist`) were not sent.
- No music row was clicked in the launcher. Play, queue, like, add-to-playlist, download, the
  discography walk and the `Now Playing` controls were not pressed; their argv, headers and
  pages are asserted in tests, and the API was exercised from the same code outside the
  launcher.
- `mpv` resolved `https://music.youtube.com/watch?v=…` through its yt-dlp hook (`media-title`
  changed from `watch?v=…` to the video title within 12 s), but full playback, seeking and the
  audio output were not verified, and a real Chromium keyring decrypt was not possible here.
- Cookie rotation (`accounts.youtube.com/RotateCookies`, which Sonora implements) is not ported:
  a pasted session lives until Google expires it. PO tokens (`potoken.rs`) are not ported either;
  an anonymous mpv/yt-dlp resolves the public song ids on its own.
- `yt-dlp` receives no cookies, so Download All of a private playlist is expected to fail; that
  was not measured.

## Attribution

The YouTube Music parsers are a port of
[`sonorahq/ytmusic-rs`](https://github.com/sonorahq/ytmusic-rs), GPL-3.0-or-later; the ported
files keep the crate's function and type names.
