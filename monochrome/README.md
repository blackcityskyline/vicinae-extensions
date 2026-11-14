# Monochrome

Search Monochrome's lossless catalog, play it through `mpv` and download the FLAC
files, with an account sign-in that works outside their desktop app. No
`yt-dlp`: the catalog serves a FLAC file per track, `mpv` streams it and Download
writes the same bytes to disk.

## Commands

- `Search Monochrome` — search as you type; the dropdown picks Everything,
  Tracks, Albums, Artists or Podcasts. Rows play, play next, queue, download,
  open the album or artist, open the page or copy the link. An empty search bar
  lists the account row and Now Playing.
- `Now Playing` — cover, title, pause, skip, back, volume, shuffle, repeat, stop,
  and the queue.

## Downloading

`Download` writes `~/Music/Monochrome` by default (`Download Folder`). Album and
discography downloads use `<Artist>/<Album>/<NN> <Title>.flac` and skip files
that already exist. There is no resume: the catalog sends the whole file in one
reply and the extension does not use ranges.

## Signing in

The desktop app fails at `auth.monochrome.st` because it only allows the origin
`https://monochrome.st`; this extension calls the same `better-auth` endpoints
from Node, where CORS does not apply. Sign In or Create an Account with email and
password; the token is kept in Vicinae's encrypted `LocalStorage`, never in a
config file, log or toast. There are no social providers on the server.

The token only supplies the name on the account row: the catalog, streams and
queue are public. Monochrome's library sync endpoint answers `404` on this
deployment, so no library is offered.

## Podcasts

The Podcasts category uses PodcastIndex, so it needs your own `PodcastIndex API
Key` and `PodcastIndex API Secret` (free registration). Without them the category
shows PodcastIndex's error.

## Playback

`mpv` is found on `PATH`; `Player` and `Player Arguments` override that. One
shared instance over `$XDG_RUNTIME_DIR/vicinae-monochrome.sock` serves both
commands; `Show the Player Window` restarts it with a window on the next play.

## Limits

- The catalog is a third-party service with no SLA; a format change there breaks
  search. All of its requests live in `src/api/monochrome.ts`.
- No pagination: the catalog ignores `offset`, `page` and `skip`; `limit` is only
  a ceiling (8 tracks, 10 albums, 8 artists on Everything).
- Sorting is local: the catalog ignores `sort` and `order`.
- No playlists, likes, mixes, radio or library: those endpoints answer `404` or
  require an account server that is not reachable.
- Downloads are 20-30 MB FLAC per track, and an interrupted one starts over.

## Not verified

Sign-in's success path: no account was created or real credentials used; only
401 and validation errors were checked against the live server. The account row
rendered after a real sign-in, but Sign Out was not pressed. Album playback and
a single-track download were run. The podcast path, batch downloads, the artist
link and the player window were not exercised.

See [`docs/audits/monochrome.md`](../docs/audits/monochrome.md).
