# Monochrome

Search Monochrome's lossless catalog, play it through `mpv` and download the FLAC files, with an
account sign-in that works outside their desktop app. No `yt-dlp`: the catalog serves a FLAC file
per track; `mpv` streams it and `Download` writes the same bytes to disk.

## Commands

- `Search Monochrome` — search as you type. The dropdown on the search bar picks what to search:
  `Everything`, `Tracks`, `Albums`, `Artists`, `Podcasts`. Every row plays, plays next, queues,
  downloads, opens its album or artist, opens the page in a browser, or copies the link. With an
  empty search bar: the account row and `Now Playing`.
- A podcast row opens the feed's episodes; an episode plays its enclosure URL through the same
  mpv. Episodes are paged 50 at a time, which is the one place the server does paginate.
- `Now Playing` — the cover, the current title, pause/resume, skip, go back, volume, shuffle,
  repeat, stop, and the queue with the rows you can jump to.

## Downloading

`Download` writes the track the catalog streams: one request per track, `~/Music/Monochrome` by
default (the `Download Folder` preference). Tracks saved from an album land in
`<Artist>/<Album>/<NN> <Title>.flac`; a track downloaded on its own from search lands in
`<Artist>/<Title>.flac`. `Download Album` and `Download Discography` walk the same path one track
at a time and skip a file that is already there, so a second run only fills the gaps. Nothing here
resumes a half-written file: the catalog sends the whole FLAC in one reply (`accept-ranges` is
offered, but the extension does not use it).

## Podcasts

Monochrome's podcast tab is PodcastIndex: their web client calls `api.podcastindex.org` with a key
that is visible in its public bundle. This extension does not borrow that key — fill in
`PodcastIndex API Key` and `PodcastIndex API Secret` (a free registration) in the preferences, and
the `Podcasts` category starts answering. Without them the category shows the error from
PodcastIndex instead of an empty list.

## Signing in

Monochrome's own desktop app is a Tauri shell over the web client. Its sign-in fails with
`Login failed: Load failed (auth.monochrome.st)` because `auth.monochrome.st` only allows the
origin `https://monochrome.st`; a request from `tauri://localhost` is refused before the
credentials are even read. This extension calls the same `better-auth` endpoints from Node,
where CORS does not apply, and gets the same session token the web client gets.

The flow is one step: `Search Monochrome` → account row → **Sign In…** (or **Create an
Account…**), email and password, done. The account row then shows the name and address that the
sign-in reply named, and the session survives restarts because the token is kept in Vicinae's
`LocalStorage` — encrypted, in `~/.local/share/vicinae/vicinae.db`, not in the plain-text
settings file. **Sign Out** removes it.

That identity is not re-checked on later runs, and cannot be: this deployment answers
`200 null` to `get-session` for a valid bearer token as well as an invalid one (see
`docs/audits/monochrome.md`). The row would otherwise call every session rejected.

There is no Google, GitHub or Discord button, here or anywhere else: the account server has no
social providers configured, so the buttons in Monochrome's own app fail too.
`POST /api/auth/sign-in/social` with `provider: google|github|discord` answers
`404 PROVIDER_NOT_FOUND`. Email and password is the only sign-up the service offers.

The extension never writes the token to a configuration file; `LocalStorage` is Vicinae's
encrypted store, and the token never appears in a log or a toast.

What needs the token is only the identity shown on the account row: the catalog, the streams and
the queue are public and play without an account. The library their client syncs cannot be read:
`data.monochrome.st/api/sync`, the endpoint `js/accounts/pocketbase.js` calls, answers
`404 {"message":"File not found."}` with a real session token, exactly like a path that does not
exist, while `/api/health` on the same host answers `200`. The route is not on this deployment,
so there is nothing for the extension to save into or fetch from.

## Playback

`mpv` is looked up on `PATH`; `Player` and `Player Arguments` override that. One `mpv` is shared
by every launcher run over `$XDG_RUNTIME_DIR/vicinae-monochrome.sock`, so `Now Playing` controls
what `Search Monochrome` started. `Show the Player Window` restarts the player with a window on
the next play.

A track is `https://tracks.monochrome.st/track/<id>`: the full file is 29,390,678 bytes for a
3:58 song, range requests answer `206` with `accept-ranges: bytes`, and `mpv` reports
`audio-codec-name: flac`. The title and cover of a queue row come from the queue cache that
`Search` writes and `Now Playing` reads (`$XDG_CACHE_HOME/monochrome/queue.json`); a damaged
file costs the titles, not playback.

## Limits

- Monochrome's catalog is a third-party public service (`tracks.monochrome.st`) with no SLA. Every
  request to it lives in `src/api/monochrome.ts`; a format change there is the only thing that can
  break search.
- Search is remote, so the builtin launcher filter is off: the list shows exactly what the catalog
  answered.
- The catalog has no pagination: it ignores `offset`, `page` and `skip`, and `limit` is only a
  ceiling. One search answers at most 8 tracks, 10 albums and 8 artists on `Everything`; the
  `Albums` and `Artists` categories ask their own endpoint and get 81 and 41 rows for a query such
  as `radiohead`. The list therefore reveals a page of 25 as you scroll, but it cannot fetch a
  page the catalog never sent.
- Sorting is the list's, not the catalog's: `Relevance` is the reply order, `Title` sorts a copy.
  The catalog ignores `sort` and `order`. The control sits at the bottom, so the first result is
  still what Enter plays.
- Monochrome's own playlists have no view: the catalog answers an empty `playlists` array for every
  query, and their playlist pages read the account server that answers `404` (below).
- Downloads are the stream itself, not a transcoded file: a track is 20-30 MB of FLAC, and a
  discography is several gigabytes. With no server-side range use, an interrupted download starts
  over.
- There is no `Like`, `Add to playlist`, `Block track/album/artist`, `Start mix` or
  `Start Infinite Radio`: each one writes to an account server the extension cannot reach, and
  none of them has a catalog endpoint (`/mixes/…`, `/mix/…`, `/radio/…` answer `404`).
- Artist social icons are not shown: `socialLinks` came back empty for every artist measured
  (Radiohead, Taylor Swift, Daft Punk, Kendrick Lamar). Each artist does carry one
  `externalLink`, which the artist page offers as `Open the Artist's Link`.
- There is no library, because the server has none to talk to: `/api/sync` answers `404` like a
  path that was never registered. `Sign In` therefore shows who you are and nothing else.

## Not verified

- The success path of sign-in and sign-up: no account was created and no real credentials were
  used here. What was checked against the live server: `401 Invalid email or password` for a wrong
  password and `[body.email] Invalid email address` for a malformed sign-up. That the reply also
  carries `{token, user}` is read from Monochrome's web client and from `better-auth`'s own
  sign-in contract.
- The account row was rendered after a real sign-in (it shows the account name), but `Sign Out`
  was not pressed; the stored shape is covered by `test/monochrome.test.ts`.
- The `session` key in `LocalStorage` has not been read back on a fresh launch with a real
  session.
- The album and artist views were rendered in the launcher with their "More albums" /
  "EPs and Singles" sections, and `Play Album` was pressed: mpv took all 11 tracks of `Kid A` and
  played the first. The artist page itself was opened from an album, not from a search row.
- The podcast path: no PodcastIndex keys were used, so no feed was searched and no episode
  played. The parsers and the SHA-1 request signature are checked against fixtures and the
  PodcastIndex contract; the HTTP path itself is unproven.
- `Download Album` and `Download Discography` were not run against the live catalog; `Download`
  on a single track was, and the file passes `flac -t`. Both batch actions build their paths with
  the same tested function.
- The artist page's `Open the Artist's Link` was not pressed; `externalLink` is parsed and tested.
- The `Show the Player Window` path was not exercised; playback was verified headless.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/monochrome/search'
vicinae 'vicinae://launch/@black/monochrome/now-playing'
```
