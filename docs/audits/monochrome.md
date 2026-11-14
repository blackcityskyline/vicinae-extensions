# monochrome

Monochrome's catalog as a launcher list, plus the account sign-in their desktop app cannot do.
Written from scratch: no code from
[`monochrome-music/desktop-app`](https://github.com/monochrome-music/desktop-app) (no `LICENSE`
in that fork) or from the minified web bundle; endpoints measured below.

## Their stack

`desktop-app` is a Tauri shell around the Monochrome web client. Its Rust side has two commands
(`greet` and a Discord RPC bridge) and no audio code: playback, accounts and the catalog run in
the bundled JavaScript, which calls:

| Host | What it serves |
| --- | --- |
| `tracks.monochrome.st` | the catalog: search, releases, artists, and one FLAC per track |
| `auth.monochrome.st` | `better-auth`: email sign-in and sign-up, sessions |
| `data.monochrome.st` | PocketBase, alive (`/api/health` `200`), but the sync routes their client calls are not registered |

Audio is not YouTube. The web client's `getStreamUrl` returns
`https://tracks.monochrome.st/track/<id>` for a catalog track; the unified-playback branch that
would proxy another provider is disabled in this build (`isEnabled()` is `false`, with an empty
base URL and token).

## Why their login fails

`Login failed: Load failed (auth.monochrome.st)` is a transport refusal, not a rejected password:

| Request | Answer |
| --- | --- |
| `OPTIONS https://auth.monochrome.st/api/auth/sign-in/email` with `origin: https://monochrome.st` | `204`, `access-control-allow-origin: https://monochrome.st` |
| the same with `origin: tauri://localhost` | no `access-control-allow-origin` for that origin |
| `POST …/sign-in/email` with a wrong password and `origin: https://monochrome.st` | `401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |

The allow-list names `https://monochrome.st` alone, so a Tauri window cannot read the answer;
Node ignores CORS, which is why the same endpoint works here.

Node must send `Origin`: without it `better-auth` answers `Missing or null Origin`. The extension
sends `origin: https://monochrome.st` on sign-in, sign-up and `get-session` (measured from its own
toast; the first request was refused).

The web client stores `data.token` from the sign-in reply (`js/accounts/auth.js`) and sends it as
`Authorization: Bearer`; the extension does too. The deployment cannot confirm a bearer token:

| Request | Answer |
| --- | --- |
| `GET /api/auth/get-session` | `200 null` |
| the same with `Authorization: Bearer <garbage>` | `200 null` |
| the same with `cookie: better-auth.session_token=<garbage>` | `200 null` |
| `GET /api/me` (what `auth.js` verifies with when it has a token) | `404`, empty body, on `auth.monochrome.st` and on `data.monochrome.st` |

`null` is the same answer for a good and a bad token; a real-token probe needs an account.
`PROVIDER_NOT_FOUND`, `200 null` for a garbage bearer and `404` on `/api/me` point at the
unconfigured `bearer()` plugin. The row treated every session as rejected and read
`Session problem` after sign-in; it now shows and stores the identity the sign-in reply carries
(`{token, user}`), since nothing on the server can re-verify it.

## Search, albums and artists

Everything browsed was measured against `tracks.monochrome.st`, not guessed from their web client.

| Request | Answer |
| --- | --- |
| `GET /search?q=radiohead` | `{tracks: 8, releases: 10, artists: 8, topResults: 1, users: 10, playlists: 0}` |
| the same with `limit=5`, `limit=50` | identical counts: the caps are the server's |
| `GET /search/tracks?q=radiohead&limit=100` | 8 tracks, and `releases`/`artists` empty |
| `GET /search/releases?q=radiohead&limit=100` | 81 releases |
| `GET /search/artists?q=radiohead&limit=100` | 41 artists |
| `&offset=5`, `&page=2`, `&skip=5` | ignored: the same rows come back |
| `&sort=title`, `&order=asc` | ignored: the same order comes back |
| `GET /releases/<id>` | the release with `trackCount` and its ordered `tracks` |
| `GET /artists/<id>` | `topTracks`, `albums`, `singles`, `compilations`, `bio`, `avatar`, `banner`, `externalLink`, `socialLinks` |
| `GET /mixes/…`, `/mix/…`, `/radio/…`, `/search/suggestions` | `404 Route not found` |

No server-side pagination or sort. The search view reveals 25 rows at a time
(`List.pagination`); `Albums` and `Artists` have their own endpoints (81 and 41 rows), `Tracks` is
capped at 8.

`/artists/<id>` is the whole artist page: `topTracks` (4-5 rows), `albums` (10), `singles` (9-10),
`compilations` (0-1), `bio`, `avatar`, `externalLink`. `socialLinks` was empty for Radiohead,
Taylor Swift, Daft Punk and Kendrick Lamar, so the extension shows none. `/releases/<id>` carries
`trackCount` and the ordered rows; "More albums from X" and "EPs and Singles from X" are the same
artist reply, split by `albums` and `singles`.

## The library their client syncs is not reachable

`js/accounts/pocketbase.js` and the deployed bundle call `https://data.monochrome.st/api/sync`
with `Authorization: Bearer <session token>`. Measured in the extension with a real sign-in
session:

| Request | Answer |
| --- | --- |
| `GET /api/health` on `data.monochrome.st` | `200` |
| `GET /api/sync` | `404 {"message":"File not found."}` |
| `GET /api/me` | the same `404` |
| `GET /api/me/profile` | the same `404` |
| `GET /api/nonexistent` | the same `404` |

`/api/sync` answers like a path never registered, so it is absent, not guarded: a route needing a
session would answer `401`/`403`. `auth.monochrome.st` answers `404` with an empty body for the
same list. With `get-session` returning `null` for any bearer token, the deployment's `bearer()`
plugin and the sync routes are missing; the web client reaches them through a same-origin cookie
the extension cannot mint. Library, playlists and history their app syncs are out of reach:
sign-in gives the identity only, and nothing is written to their servers.

Social sign-in does not exist here. Their app draws Google, GitHub and Discord buttons
(`js/app.js`), each posting to the same endpoint the web client uses:

| Request | Answer |
| --- | --- |
| `POST /api/auth/sign-in/social` `{"provider":"google",…}` | `404 {"message":"Provider not found","code":"PROVIDER_NOT_FOUND"}` |
| the same with `github`, `discord` | the same `404` |
| the same with `twitter`, `twitch`, `apple` | the same `404` |
| repeated calls in a minute | `429 Too many requests. Please try again later.` |

`PROVIDER_NOT_FOUND` is better-auth's answer for a provider absent from `socialProviders`, so no
OAuth client id is set. Only email and password work; the extension offers exactly that.

## Where the session lives

`password` preferences mirroring `ytmusic`'s cookies are the wrong place: a pasted token left
`~/.config/vicinae/settings.json` with only the three defaults under
`providers["@black/monochrome"].preferences` — `player`, `playerArgs`, `playerWindow` — and no
`sessionToken`, so the next command read no token. That file is plain config; the extension writes
the token through `LocalStorage`, which Vicinae encrypts into `~/.local/share/vicinae/vicinae.db`
(`storage_data_item`); `Sign Out` removes it. Sign-in is one step: the form's answer is stored and
verified without copy-and-paste. The preference was dropped from the manifest in the same change.

## Measurements

| Fact | Measurement |
| --- | --- |
| Track search | `GET /search/tracks?q=radiohead%20creep&limit=2` → `{tracks:[…]}`, fields `id`, `trackId`, `title`, `artistIds`, `artistNames`, `releaseId`, `artwork`, `playable`, `duration` (ms), `isrc`, `recordingId` |
| Release | `GET /releases/154041929472937984` → `{releaseId, title, artists[], releaseDate, label, artwork, trackCount, tracks[]}`, each track `trackId`, `title`, `duration` (ms), `isrc`, `artists[]`, `artwork`, `trackNumber` |
| Artist | `GET /artists/152523067401179136` → profile, `topTracks`, `albums`, `singles`, `compilations`, `externalLink`, `socialLinks[]` (empty) |
| Release search | `GET /search/releases?q=…&limit=2` → `{releases:[…]}`; the `Albums` category uses it with `limit=100` |
| Stream | `GET /track/154049681742106624` → `200`, `content-type: application/octet-stream`, `content-length: 29390678`, `accept-ranges: bytes`; a range request answers `206` |
| Downloaded file | the same URL saved whole: `content-length: 26603850`, `cache-control: public, max-age=31536000, immutable`, `file` → `FLAC audio bitstream data, 16 bit, stereo, 44.1 kHz`, `flac -t` ok |
| Podcasts | no Monochrome host serves them: their web client calls `https://api.podcastindex.org/api/1.0` directly, with `X-Auth-Key`, `X-Auth-Date` and `Authorization = SHA-1(key + secret + date)`; the key and secret are literals in the public bundle |
| Artwork | `https://tracks.monochrome.st/proxy/mi/<releaseId>-1A01.jpg` |
| Web page | `GET https://monochrome.st/track/<id>` serves the SPA's `index.html` (`200 text/html`) |
| Account data | `GET https://data.monochrome.st/api/sync` → `404 {"data":{},"message":"File not found.","status":404}` without a session; `GET /api/health` → `200`; `GET /api/collections/users/records` is public |

The catalog is a plain HTTP API with no key: a public redistributor, not a service with a
contract — the README says so — and every call is in `src/api/monochrome.ts`.

## Downloads

No download endpoint exists: their client has none. `downloadTrack` takes the URL
`resolveTrackStream` returns — the same `tracks.monochrome.st/track/<id>` `mpv` streams — and
segments it in the browser (DASH/HLS, `downloadDashStream` / `downloadHlsStream`) through the File
System Access API. `/api/files/token` is PocketBase's file token route on `data.monochrome.st`;
`/download` is the desktop-app page.

A download is one plain `GET` of the streamed file:

```
$ curl -sD - -o track.flac https://tracks.monochrome.st/track/154049653766098944
HTTP/2 200
content-type: application/octet-stream
content-length: 26603850
accept-ranges: bytes
$ file track.flac
FLAC audio bitstream data, 16 bit, stereo, 44.1 kHz
$ flac -t track.flac
track.flac: testing, 78% complete ok
```

The extension saves the reply body: `Download` puts `Creep.flac` (29 MB on disk) under
`~/Music/Monochrome/Radiohead/`. Their DASH machinery exists only because a browser cannot stream
to disk; the bytes are the same.

## Podcasts

Their podcast tab is not on their servers: the bundle holds
`const Om="https://api.podcastindex.org/api/1.0"`, a literal key (`YU5HMSDYBQQVYDF6QN4P`) and a
secret; each request is signed with the date. Routes: `/search/byterm?q=&max=`,
`/podcasts/byfeedid?id=`, `/episodes/byfeedid?id=&max=&offset=`, `/podcasts/trending`. Used here:
the first, the third, and `/podcasts/byfeedid` through the search row.

The extension ships neither key nor secret: `PodcastIndex API Key` and `PodcastIndex API Secret`
are preferences; without them `Podcasts` reports the missing key, not an empty list. The
signature is a plain SHA-1 of the three parts concatenated, checked against a fixed vector in
`test/monochrome.test.ts`.

## Playback

Verified against the running player, not by reading code:

```
$ node ipc.mjs /run/user/1000/vicinae-monochrome.sock
1 success "Creep"
2 success "https://tracks.monochrome.st/track/154049681742106624"
3 success false                  # idle-active
5 success "flac"                 # audio-codec-name
6 success {"samplerate":44100,"channel-count":2,"format":"s16"}
```

Search plays with Enter; the first rows show `Duration 3:59`, `Format FLAC` and the release id,
`Now Playing` renders the cover and the queue row, and Enter there sent `pause: true`. The player
is a second `mpv` on its own socket; the `ytmusic` instance kept playing untouched.

## Verified in the launcher

- `Loaded extension monochrome:search` / `:now-playing`, then `Started`, no error after.
- A search for `radiohead creep` returned catalog rows with cover art and a populated detail pane.
- Sign-in with `nobody@example.invalid` produced `Could not sign in — Invalid email or password`.
- Sign-up with `nobody` produced `Could not sign up — [body.email] Invalid email address`: the
  endpoint is reachable and rejects before creating anything.
- `/api/auth/get-session` answers `200 null` with no token, a garbage bearer and a garbage session
  cookie, while `GET /api/me` is `404` on both hosts; the account row cannot verify a stored
  session and does not try.
- `Play Album` on `Kid A` filled mpv's playlist with 11 tracks (`playlist-count 11`,
  `media-title "Everything In Its Right Place"`) and wrote the 11 titles to
  `~/.cache/monochrome/queue.json`.
- `Download` on `Creep` wrote `~/Music/Monochrome/Radiohead/Creep.flac` (29 MB), which `flac -t`
  accepted.
- `Podcasts` with a temporary default reported `Podcasts need a PodcastIndex API key: fill in API
  Key and API Secret in the extension preferences`, not an empty list.

## Not verified

- Podcasts never ran with a real PodcastIndex key: no feed searched, no episode played. The
  request shape, SHA-1 signature and both parsers are checked by fixtures from their client's own
  transform functions, not a live reply.
- `Download Album` and `Download Discography` never ran against the live catalog. A single
  `Download` did, and its file passed `flac -t`; the batch actions build paths with the same
  function.
- `Show the Player Window` was not exercised.

## Cuts

- **Their download machinery.** DASH/HLS segmenting, a quality picker and a ZIP writer exist to
  work around a browser's inability to stream to disk. Saving the reply body does the same in
  three lines.
- **No library.** `/api/sync` needs a real session to answer anything but `404`, and its
  `userPlaylists` tracks may come from other providers. Reading it would be written against a
  guess.
- **No yt-dlp.** The stream is a direct FLAC; a downloader adds a process and a dependency for
  nothing.
- **No separate app.** The user chose a Vicinae extension; their app's window is not part of this
  repository.
- **Server-side pagination.** The catalog ignores `offset`, `page` and `skip`; only PodcastIndex
  pages (`max`/`offset`), so only the podcast view has real pages.
