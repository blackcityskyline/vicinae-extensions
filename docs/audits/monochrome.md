# monochrome

Monochrome's catalog as a launcher list, with the account sign-in their desktop app cannot do.
Written from scratch: no code was taken from
[`monochrome-music/desktop-app`](https://github.com/monochrome-music/desktop-app) (no `LICENSE`
file in that fork) or from the minified web bundle; the endpoints below were measured.

## What their stack is

`desktop-app` is a Tauri shell around the Monochrome web client. Its Rust side exposes two
commands (`greet` and a Discord RPC bridge) and no audio code: playback, accounts and the catalog
all run in the bundled JavaScript, which calls:

| Host | What it serves |
| --- | --- |
| `tracks.monochrome.st` | the catalog: search, releases, artists, and one FLAC per track |
| `auth.monochrome.st` | `better-auth`: email sign-in and sign-up, sessions |
| `data.monochrome.st` | PocketBase, alive (`/api/health` `200`), but the sync routes their client calls are not registered |

Audio is not YouTube. The web client's `getStreamUrl` returns
`https://tracks.monochrome.st/track/<id>` for a catalog track, and the unified-playback branch
that would have proxied another provider is disabled in this build (`isEnabled()` is `false`, with
an empty base URL and token).

## Why their login fails

`Login failed: Load failed (auth.monochrome.st)` is a transport refusal, not a rejected password:

| Request | Answer |
| --- | --- |
| `OPTIONS https://auth.monochrome.st/api/auth/sign-in/email` with `origin: https://monochrome.st` | `204`, `access-control-allow-origin: https://monochrome.st` |
| the same with `origin: tauri://localhost` | no `access-control-allow-origin` for that origin |
| `POST …/sign-in/email` with a wrong password and `origin: https://monochrome.st` | `401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` |

The allow-list names `https://monochrome.st` alone, so a Tauri window cannot read the answer.
Node is not a browser and ignores CORS, which is why the same endpoint works from here.

The one header Node does have to send is `Origin`: without it `better-auth` answers
`Missing or null Origin`. The extension sends `origin: https://monochrome.st` on sign-in,
sign-up and `get-session`. That was measured from the extension's own toast, after the first
version of the request was refused.

The web client stores `data.token` from the sign-in reply (`js/accounts/auth.js`) and sends it as
`Authorization: Bearer`, which is what the extension does.

This deployment cannot confirm a bearer token, though, and the first version of the account row
did not survive that:

| Request | Answer |
| --- | --- |
| `GET /api/auth/get-session` | `200 null` |
| the same with `Authorization: Bearer <garbage>` | `200 null` |
| the same with `cookie: better-auth.session_token=<garbage>` | `200 null` |
| `GET /api/me` (what `auth.js` verifies with when it has a token) | `404`, empty body, on `auth.monochrome.st` and on `data.monochrome.st` |

`null` for a good token and for a bad one is the same answer, so nothing can be concluded from it:
probing with a real token was impossible without an account, and `PROVIDER_NOT_FOUND`, `200 null`
for a garbage bearer and a `404` on `/api/me` all point at the `bearer()` plugin not being
configured. The row therefore treated every session as rejected and read `Session problem` right
after a successful sign-in. It now shows the identity the sign-in reply already carries
(`{token, user}`) and stores that pair; nothing re-verifies, because nothing on this server can.

## Search, albums and artists

Everything the extension browses was measured against `tracks.monochrome.st`; nothing is guessed
from their web client.

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

So there is no server-side pagination to drive, and no server-side sort. The search view reveals
what arrived 25 rows at a time (`List.pagination`); `Albums` and `Artists` ask their own endpoint,
which is what makes that reveal mean anything (81 and 41 rows), while `Tracks` is capped at 8 by
the catalog itself.

`/artists/<id>` is the whole artist page in one reply: `topTracks` (4-5 rows), `albums` (10),
`singles` (9-10), `compilations` (0-1), `bio`, `avatar`, `externalLink`. `socialLinks` was empty
for Radiohead, Taylor Swift, Daft Punk and Kendrick Lamar, so the extension shows none.
`/releases/<id>` carries `trackCount` and the ordered rows, which is what the album view lists;
"More albums from X" and "EPs and Singles from X" are the same artist reply, split by `albums`
and `singles`.

## The library their client syncs is not reachable

`js/accounts/pocketbase.js` (and the deployed bundle) call `https://data.monochrome.st/api/sync`
with `Authorization: Bearer <session token>`. Measured from inside the extension with the session
a real sign-in produced:

| Request | Answer |
| --- | --- |
| `GET /api/health` on `data.monochrome.st` | `200` |
| `GET /api/sync` | `404 {"message":"File not found."}` |
| `GET /api/me` | the same `404` |
| `GET /api/me/profile` | the same `404` |
| `GET /api/nonexistent` | the same `404` |

The sync route answers exactly like a path that was never registered, so it is absent, not
guarded: a route that needed a session would answer `401`/`403`. `auth.monochrome.st` answers
`404` with an empty body for the same list. Together with `get-session` returning `null` for any
bearer token, this says the deployment's `bearer()` plugin and the sync routes are missing, and
the browser client reaches them through a same-origin cookie the extension cannot mint.

So the library, playlists and history their app syncs are out of reach here, and sign-in gives the
extension the identity only. Nothing is written to their servers.

Social sign-in does not exist on this deployment. Their app draws Google, GitHub and Discord
buttons (`js/app.js`), and every one of them posts to the same endpoint the web client does:

| Request | Answer |
| --- | --- |
| `POST /api/auth/sign-in/social` `{"provider":"google",…}` | `404 {"message":"Provider not found","code":"PROVIDER_NOT_FOUND"}` |
| the same with `github`, `discord` | the same `404` |
| the same with `twitter`, `twitch`, `apple` | the same `404` |
| repeated calls in a minute | `429 Too many requests. Please try again later.` |

`PROVIDER_NOT_FOUND` is better-auth's answer for a provider that is not configured in
`socialProviders`, so no OAuth client id is set for any of them. Only email and password are
usable; the extension offers exactly that.

## Where the session lives

The first design put the token in a `password` preference, mirroring what `ytmusic` does with
cookies. It was measured to be the wrong place: after signing in and pasting the token into that
field, `~/.config/vicinae/settings.json` still had only the three default preferences under
`providers["@black/monochrome"].preferences` — `player`, `playerArgs`, `playerWindow` — and no
`sessionToken`, so the next command run read no token. That file is the plain config; the
extension now writes the token through `LocalStorage`, which Vicinae encrypts and stores in
`~/.local/share/vicinae/vicinae.db` (`storage_data_item`), and `Sign Out` removes it. Sign-in is
therefore one step: the form's answer is stored and verified without a copy-and-paste.

The preference was dropped from the manifest in the same change, so nothing reads a stale field.

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

The catalog answers as a plain HTTP API with no key. It is a public redistributor, not a service
with a contract — the README says so, and every call to it is in `src/api/monochrome.ts`.

## Downloads

There is no download endpoint to discover, because their own client has none: `downloadTrack`
takes the URL `resolveTrackStream` returns — the same `tracks.monochrome.st/track/<id>` that `mpv`
streams — and segments it in the browser (DASH/HLS, `downloadDashStream` / `downloadHlsStream`),
writing the pieces through the File System Access API. `/api/files/token` is PocketBase's file
token route on `data.monochrome.st`, and `/download` is the desktop-app page.

So a download is one plain `GET` of the file that was already being streamed:

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

The extension saves the reply body, so `Download` puts `Creep.flac` (29 MB on disk) under
`~/Music/Monochrome/Radiohead/`. Their browser path saves the same bytes without the DASH
machinery, which only exists there because a browser cannot stream to disk.

## Podcasts

Their podcast tab is not on their servers at all: the bundle contains
`const Om="https://api.podcastindex.org/api/1.0"` next to a literal key (`YU5HMSDYBQQVYDF6QN4P`)
and secret, and the client signs each request with the date. The routes it uses are
`/search/byterm?q=&max=`, `/podcasts/byfeedid?id=`, `/episodes/byfeedid?id=&max=&offset=` and
`/podcasts/trending`; only the first and the third are used here, plus `/podcasts/byfeedid`
implicitly through the search row.

The extension ships neither the key nor the secret: `PodcastIndex API Key` and
`PodcastIndex API Secret` are preferences, and without them the `Podcasts` category reports the
missing key instead of returning nothing. The signature is a plain SHA-1 of the three parts
concatenated, checked against a fixed vector in `test/monochrome.test.ts`.

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

Search plays with Enter, the first rows show `Duration 3:59`, `Format FLAC` and the release id,
`Now Playing` renders the cover and the queue row, and Enter there sent `pause: true`. The player
is a second `mpv` on its own socket; the `ytmusic` instance on the machine kept playing untouched.

## Verified in the launcher

- `Loaded extension monochrome:search` / `:now-playing` and `Started` with no error after.
- A search for `radiohead creep` returned catalog rows with cover art and a populated detail pane.
- Sign-in with `nobody@example.invalid` produced `Could not sign in — Invalid email or password`.
- Sign-up with the email `nobody` produced `Could not sign up — [body.email] Invalid email address`,
  so the sign-up endpoint is reachable and rejects before creating anything.
- `/api/auth/get-session` answers `200 null` with no token, with a garbage bearer token and with
  a garbage session cookie, while `GET /api/me` is `404` on both hosts; the account row cannot
  therefore verify a stored session and does not try.
- `Play Album` on `Kid A` filled mpv's playlist with all 11 tracks (`playlist-count 11`,
  `media-title "Everything In Its Right Place"`) and wrote the 11 titles to
  `~/.cache/monochrome/queue.json`.
- `Download` on `Creep` wrote `~/Music/Monochrome/Radiohead/Creep.flac` (29 MB), which `flac -t`
  accepted.
- The `Podcasts` category, opened with a temporary default, reported
  `Podcasts need a PodcastIndex API key: fill in API Key and API Secret in the extension
  preferences` instead of an empty list.

## Not verified

- Podcasts were never called with a real PodcastIndex key: no feed was searched and no episode
  played. The request shape, the SHA-1 signature and both parsers are checked by fixtures read
  from their client's own transform functions, not from a live reply.
- `Download Album` and `Download Discography` were not run against the live catalog. A single
  `Download` was, and its file passed `flac -t`; the batch actions build paths with the same
  function the single download uses.
- The `Show the Player Window` path was not exercised.

## Cuts, and why

- **Their download machinery.** DASH/HLS segmenting, a download-quality picker and a ZIP writer
  all exist in their browser client to work around a browser's inability to stream to disk.
  Saving the reply body does the same thing in three lines.
- **No library.** `/api/sync` needs a real session to answer anything but `404`, and its
  `userPlaylists` tracks may come from providers other than the catalog. Reading it would be a
  feature written against a guess.
- **No yt-dlp.** The stream is a direct FLAC; a downloader would add a process and a dependency
  for nothing.
- **No separate app.** The user chose a Vicinae extension; their app's own window is not part of
  this repository.
- **Server-side pagination for the catalog.** It ignores `offset`, `page` and `skip`; only
  PodcastIndex pages (`max`/`offset`), so only the podcast view has real pages.
