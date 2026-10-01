# lastfm

Recent, loved and top music from Last.fm, read straight from the API.

Ported from [`eggsy/raycast-extensions`](https://github.com/eggsy/raycast-extensions)
(Raycast, MIT).

| Command | Calls |
| --- | --- |
| Recent Tracks | `user.getrecenttracks` |
| Loved Tracks | `user.getlovedtracks` |
| Top Artists | `user.gettopartists` |
| Top Albums | `user.gettopalbums` |
| **Browse Last.fm** | five views and an artist page, below |

### Browse Last.fm: five views, one command

A dropdown in the search bar picks what you are looking at. Each view asks for
its own data only when you switch to it, so opening the command costs one request.

| View | Calls |
| --- | --- |
| Global Charts | `chart.getTopArtists`, `chart.getTopTracks` |
| This Week | `user.getWeeklyArtistChart`, `user.getWeeklyTrackChart` |
| Your Top Tracks | `user.getTopTracks` |
| Your Library | `library.getArtists`, paged |
| Find Artist | `artist.search`, on what you type |

Any artist row anywhere pushes **Show Artist**: one `Detail` built from
`artist.getInfo`, `artist.getTopTracks`, `artist.getTopAlbums`, `artist.getInfo`'s
own `similar` and `tags` — five methods in a single view. The library pages
through the list's own pagination, so scrolling asks for the next 50 instead of
loading everything.

The global charts need **no username at all**, so that view works before anything
has been configured.

## Settings

| Preference | What |
| --- | --- |
| API Key | from <https://www.last.fm/api/accounts/create>. **Leave the callback URL empty** |
| Last.fm Username | the handle on the profile page, not the display name |
| Period | the window Top Artists and Top Albums count |

Neither preference is marked required, and that is deliberate. Measured on this
machine: with a `required` preference left unset, Vicinae **refuses to start the
command and logs nothing at all** — no `Loaded extension`, no error. The command
therefore runs and shows an empty view that says what is missing, which is
findable; a command that silently never starts is not.

## No callback URL, and no secret either

The account application asks for a callback URL. Leave it blank. Last.fm's own
specification ties it to web applications only:

> **2.1 Web-based Authentication**
> You must also configure a callback URL which will be used in Section 3.2 below.

Section 3.2 is the redirect that hands a token to a server. The desktop flow in
section 4 — which is what an extension is — never uses it: it opens a browser,
you authorise, and the browser-based process is over.

The bigger finding is that the secret is not needed either. Every method this
extension calls is readable with nothing but the API key. Verified live, with no
signature:

```
chart.gettopartists   &api_key=…&format=json  →  403  error 10 "Invalid API key"
user.getrecenttracks  &api_key=…&format=json  →  403  error 10 "Invalid API key"
```

The complaint is about the key, not about a missing `api_sig`. So there is no
`api_secret`, no session key, no `Connect Last.fm` screen and no browser.

## What the port changed, and why

**Seven upstream commands became four.** Upstream also ships a menu-bar player,
a 236-line now-playing view and a combined view. The roadmap scope is recent,
loved, top artists and top albums, and "now playing" is the first row of
`user.getrecenttracks` wearing a hat.

**Nothing to install.** Upstream needs `node-fetch`, `swr` and `@raycast/utils`;
Node 26 has `fetch`, and one `useEffect` is a cache.

**Dates are built from their parts.** Same note as `shell-history`,
`in-the-time-zone` and `tempmail`: `toLocaleString` follows the machine's
locale, which turns 10 March into 3/10 and midnight into 12:00 AM.

**Artwork is checked before it becomes an icon.** Last.fm sends an empty string
for a track with no cover, and the URL is the API's choice, not ours, so an icon
only ever gets an `https` url that ends in an image extension. This is not
theoretical — the live recent tracks for this account have empty artwork for every
entry.

**The rank comes from the API.** `user.gettopartists` and `user.gettopalbums`
both send `@attr.rank`, so the row number is never inferred from list position.

**A method that reports `total` is not allowed to look empty.** Each of these
methods says in `@attr` how many rows to expect. If rows arrive and `total` says
otherwise, that is raised as an error — because an empty list is exactly what an
account with nothing in it looks like, and the two must never be confused. See
the note below for what this caught.

## `user.gettopartists` answers under `topartists`, not `artists`

Reported by the user as "Top Artist shows no results". The account had 198 top
artists. The response member is `topartists` — while `chart.getTopArtists` and
`library.getArtists` both use `artists` — so the code read `undefined`,
`unwrapList` turned that into `[]`, and the empty list rendered as
"Last.fm has no top artists for …".

Two things let it through:

- The live tests only asserted `Array.isArray(...)`, and an empty array is an
  array.
- The account used for testing, `koyaanis`, genuinely has no top artists.

So the check now compares `@attr.total` with what was parsed, and fails on a
disagreement rather than on emptiness. Breaking the member name again makes it
say, in the empty view:

```
Last.fm reported 198 top artists and sent none that could be read.
```

## Two shapes of `artist`, found by looking at the answers

This is the bug that a unit test written from the expected shape would not have
caught.

```
user.getrecenttracks → "artist": { "mbid": "", "#text": "Venetian Snares" }
user.getlovedtracks  → "artist": { "url": "…", "name": "Radiohead", "mbid": "…" }
```

The same field, in the same API, with the name in `#text` in one method and in
`name` in the other. Reading only `name` leaves **every recent track showing
"Unknown artist"**. `named()` reads both, and `test/live.test.ts` pins both
captured shapes.

`user.getWeeklyChartList` is the obvious way to get a weekly chart and it is
useless: for this account it answers with **1128 entries**, every one of them
`{ "#text": "", from, to }`. The dated charts are the ones with rows in them, and
those are what this uses.

Two more, in the same direction:

- A collection of one comes back as a **bare object**, not an array of one. That
  is how a user with exactly one recent track gets an empty list.
- **Search results live under `results.artistmatches`**, with opensearch metadata
  beside them, and carry `listeners` where the user methods carry `playcount`.
- `listeners` and `tags` exist on the chart methods but **not** on
  `user.gettopartists`, which is the one this extension calls. Both are pinned as
  absent in the test, so nobody re-adds an accessory that can only ever be empty.

## Open on YouTube Music or Monochrome

Every track, album and artist row has both actions. Each searches the site and
opens the result page in the default browser through `open()`, which is xdg-open
on Linux. There is no public search API without a key, so this opens the search
page and lets you pick.

The artist goes into the query for a track or an album, or the search returns
hundreds of unrelated versions. It is left out for an artist row, and left out
when it is the `Unknown artist` placeholder, because searching for that finds
nothing. `test/sites.test.ts` covers both, and that a `&`, a `#` or a `?` in a
name cannot turn into a parameter.

**Monochrome is `monochrome.st`, not `monochrome.tf`.** The `.tf` host answers
`503` with a page whose entire content is a meta refresh to `.st` — a `<h1>meow
:3</h1>` and a link saying "looking for monochrome?". The app's own canonical
tags still say `.tf`, so the old host is still all over its HTML, but following
it costs a round trip and a joke page.

### What Monochrome turned out to be

Not a torrent tracker. It is a Netease mirror: "Stream and download millions of
Hi-Res FLACs, unreleased songs and music videos, all for free".

| | |
| --- | --- |
| App | `https://monochrome.st`, a client-rendered SPA (Angular, `assets/index-*.js`) |
| Routes | `/`, `/search`, `/library`, `/recent`, `/podcasts`, `/unreleased`, `/parties`, `/donate` |
| API | `https://tracks.monochrome.st`, reported version 2.10, **no key and no login** |
| Search | `GET /search?q=…` — not `keywords=`, which answers `400 {"error":"Missing required parameter: q"}` |
| Answer | `{ tracks, releases, artists, topResults, users, playlists }`; `limit` and `type` are ignored |
| Track row | `id`, `title`, `artistIds`, `artistNames`, `releaseId`, `artwork`, `explicit`, `playable`, `duration`, `isrc` |
| Artwork | `https://tracks.monochrome.st/proxy/mi/<releaseId>-1A01.jpg` |
| Other hosts | `auth.monochrome.st`, `data.monochrome.st`, `images.monochrome.qzz.io`, `tidal-proxy.monochrome.tf/tidal`, `worker.uploads.monochrome.qzz.io` |
| Blocked from crawlers | `/functions/`, `/api/`, `/auth/` in `robots.txt` |

The router reads the search term off the query string — the bundle contains
`case"/search": … this.search({q, s, a, al, v, p, i, offset})` — which is why the
deep link is `/search?q=…` and not just `/search`.

Its API needs nothing, so a real native search command is possible here. That is
not what was asked for; this is only the browser action.

## Tests

| File | What it pins down |
| --- | --- |
| `test/lastfm.test.ts` | the request url, sorted parameters, values that cannot break out of the query, artwork selection, the API's error numbers |
| `test/when.test.ts` | dates, with `TZ` pinned so the exact assertions mean the same thing anywhere |
| `test/artist.test.ts` | the artist document, and that nothing empty leaks into it |
| `test/sites.test.ts` | the search query and url per site, and that a name cannot break the url |
| `test/live.test.ts` | the captured API shapes, and — with a key — every view against the live API |

The live checks need a key and skip without one, and **a skipped check is not
counted as a pass**:

```bash
LASTFM_KEY=<api key> LASTFM_USER=<username> npm test
```

With a key they assert that no artist name is lost anywhere, that the weekly
charts are the dated ones rather than the empty list endpoint, that two library
pages do not overlap, and that a rejected key raises rather than returning an
empty list.
