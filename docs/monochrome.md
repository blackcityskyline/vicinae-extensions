# monochrome.tf — what it is and what answers

Reference notes for anyone building against it again. Every number here was
measured on 2026-10-01 with `curl` from a plain desktop, no cookie, no key, no
user agent. Anything not measured is under [Not verified](#not-verified).

Used so far by `lastfm`, which only links out to it. Nothing here needs a key, so
a real native client is possible — see [What this opens up](#what-this-opens-up).

## Domains

`monochrome.tf` is the name in every canonical tag, every `robots.txt` and the
sitemap, but it does not serve the app. It answers `503` with a 190-byte page
whose entire content is:

```html
<head><meta http-equiv='refresh' content='0; url=https://monochrome.st''><title>monochrome</title></head>
<h1>meow :3</h1><p><p><a href='https://monochrome.st'>looking for monochrome?</a></p>
```

So `monochrome.st` is the host to use. Resolved to `178.236.253.83`, served by
Cloudflare, which also fronts the API host.

`hot.monochrome.tf` and `tidal-proxy.monochrome.tf` did not connect at all from
here (`curl` exit 7), consistent with the `.tf` host being retired piecemeal.

## What it actually is

Not a torrent tracker, which is what the name suggests to anyone who has seen
that kind of domain before. The description in its own `<head>`:

> Stream and download millions of Hi-Res FLACs, unreleased songs and music
> videos, all for free on Monochrome.

A frontend over a Netease Cloud Music mirror, and over other providers as well —
the app's own id resolver accepts `t/`, `apple/`, `tracks/`, `mono/` and
`monochrome/` prefixes and maps them to `tidal`, `apple` and `tracks`.

Routes it ships (`sitemap.xml`, nine of them):

```
/            /search    /library    /recent
/podcasts    /unreleased /parties   /donate
```

## Endpoints

On `https://tracks.monochrome.st`, reported version `2.10`.

| Request | Answer |
| --- | --- |
| `GET /health` | `200 {"cache":{"size":1000},"status":"ok"}` |
| `GET /search?q=radiohead` | `200`, the useful one |
| `GET /search?keywords=radiohead` | `400 {"error":"Missing required parameter: q"}` |
| `GET /search?q=…&limit=3` | `200`, byte-identical to without `limit` — ignored |
| `GET /search?q=…&type=song` | `200`, identical — ignored |
| `GET /search?q=test`, no user agent | `200` |
| `GET /artist?id=1` | `404 {"error":"NOT_FOUND","message":"Route not found"}` |
| `GET /goal`, `GET /contributors` | `200` json |

**The parameter is `q`.** It is not `keywords`, and this is not
NeteaseCloudMusicApi: `/artist` and `/login/cellphone` are absent, and paging
parameters do nothing.

The answer is one object with six collections, sized server-side and not by
argument:

```json
{ "tracks": 8, "releases": 10, "artists": 8, "topResults": 1, "users": 10, "playlists": 0 }
```

### Shapes

`tracks[]`

```json
{ "id": "154049687815458816", "trackId": "154049687815458816", "title": "Let Down",
  "artistIds": ["152523067401179136"], "artistNames": ["Radiohead"],
  "releaseId": "154041926511759360",
  "artwork": "https://tracks.monochrome.st/proxy/mi/154041926511759360-1A01.jpg",
  "explicit": false, "playable": true, "duration": 299560, "isrc": "GBAYE9701374",
  "recordingId": "156038937100423168", "searchPriority": 0 }
```

`duration` is milliseconds. `isrc` and `recordingId` are the fields to match
against another service rather than matching on titles.

`releases[]`

```json
{ "id": "154041926511759360", "releaseId": "154041926511759360", "title": "OK Computer",
  "artistIds": ["152523067401179136"], "artistNames": ["Radiohead"],
  "releaseDate": "1997-05-28T00:00:00.000Z", "releaseType": "ALBUM" }
```

`artists[]` and `topResults[0]` are the same shape:

```json
{ "id": "152523067401179136", "artistId": "152523067401179136", "name": "Radiohead",
  "username": "radiohead", "displayName": "Radiohead", "sortName": "radiohead",
  "avatar": "https://tracks.monochrome.s…" }
```

Artwork is a real image, not a redirect: the URL above answers `200`,
`image/jpeg`, 125 kB.

### Other hosts

| Host | What |
| --- | --- |
| `tracks.monochrome.st` | the API above |
| `auth.monochrome.st` | login; `/` and `/.well-known/openid-configuration` are `404` |
| `data.monochrome.st` | exists, `/` is `404` json |
| `images.monochrome.qzz.io` | image CDN, `/` is `404` |
| `worker.uploads.monochrome.qzz.io` | uploads, referenced by the bundle only |
| `api.monochrome.st` | `/api/health`, `/api/crons`, `/api/sync`, `/api/logs/stats`, `/api/collections`, `/api/backups` — the signed-in half |

`robots.txt` disallows exactly `/functions/`, `/api/` and `/auth/`, so the
signed-in half is meant to stay unindexed. `/api/health` and `/api/settings`
answer without a cookie, but nothing beyond them was tested and none of it is
needed for a read-only client.

One more thing the bundle does, worth knowing before writing a lyrics feature:
lyrics come from Genius, with a token embedded in the client, proxied through
`api.allorigins.win`. That is someone else's quota, not a public API.

### The client also talks to hifi-api

`https://github.com/binimum/hifi-api`, with routes `/info`, `/track`,
`/recommendations`, `/artist`, `/artist/bio`, `/artist/similar`, `/album/similar`,
`/cover` and `/search`, taking `q`, `id`, `offset`, `limit`, `quality`,
`immersiveAudio`, `f` and `skip_tracks`. Which instance answers is read from
`localStorage` and refreshed against an uptime-kuma, falling back to
`tracks.monochrome.st`.

## Deep links

Routing is on the hash and the path. The handler is:

```js
case "search": await this.renderSearchPage(decodeURIComponent(rest))
```

where `rest` is everything after the first `/`. So:

```
https://monochrome.st/search/arthur%20rubinstein
```

The term is **percent-encoded as one path segment**, not `?q=`. A `?q=` link opens
the same page and then searches for the empty string — measured by the user, not
by me.

Other cases in the same switch: `parties`, `party/<id>`, `album/<id>`, plus
`#fullscreen` and `#recent`. `window.location.hash` is set directly for
navigation, and the app rewrites a bare hash into a path on load.

## Traps

**`case"/search"` is not the router.** The bundle contains a `case"/search"`
inside the *API client's* route dispatcher, and that one does take `q`. Grepping
the bundle for it and believing the first hit produces a search page that
searches for `""`. There is no `.get("q")` anywhere in the SPA bundle — that grep
settles it in a second.

**`.tf` in a URL is a dead end.** Every path on `monochrome.tf` is that 190-byte
meow page, including `/login.php`, `/torrents.php` and `/robots.txt`, so probing
endpoints there tells you nothing.

**Every path returns the same 456 kB.** It is a client-rendered SPA, so a `200`
with identical bytes means nothing about whether the route exists. `/nonexistent`
answers `200` too.

**Paging is not a parameter.** `limit` and `offset` are ignored; `8` tracks and
`10` releases is what you get.

## What this opens up

A native Vicinae command is possible with no key and no login: query
`/search?q=…`, render `tracks`/`releases`/`artists` as rows, resolve streams from
`releaseId` + `trackId` (the app accepts `tracks/<id>` and `mono/<id>` as ids, and
has `tidal-proxy` and `getTrackMetadata` for enrichment). `lastfm` only links out
because that is what was asked for.

Whether to do that is a separate decision, not part of this note. Streaming
itself is unmeasured here.

## Not verified

- **Playback.** Stream urls, `hifi-api` `/track`, `tidal-proxy`, and whether the
  site requires an account to play anything.
- **The signed-in half.** `/api/*`, `/auth/*`, `/functions/*` beyond the
  unauthenticated `404`/`200` answers above.
- **Which cookie domain a logged-in session uses.** The extension opens `.st`; a
  session held on `.tf` would not carry over.
- **Paging or rate limits.** Nothing in the API advertises them, and `/token`
  style budgets seen on other hydra APIs do not apply here. Eight parallel
  searches were not tried.

If any of these turn out to matter, measure them before building on them, the
same way this note was written.