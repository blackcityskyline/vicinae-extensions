# lastfm

Recent, loved and top music from Last.fm, read straight from the API.

Ported from [`eggsy/raycast-extensions`](https://github.com/eggsy/raycast-extensions)
(Raycast, MIT).

| Command | Call |
| --- | --- |
| Recent Tracks | `user.getrecenttracks` |
| Loved Tracks | `user.getlovedtracks` |
| Top Artists | `user.gettopartists` |
| Top Albums | `user.gettopalbums` |

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

Two more, in the same direction:

- A collection of one comes back as a **bare object**, not an array of one. That
  is how a user with exactly one recent track gets an empty list.
- `listeners` and `tags` exist on the chart methods but **not** on
  `user.gettopartists`, which is the one this extension calls. Both are pinned as
  absent in the test, so nobody re-adds an accessory that can only ever be empty.

## Tests

| File | What it pins down |
| --- | --- |
| `test/lastfm.test.ts` | the request url, sorted parameters, values that cannot break out of the query, artwork selection, the API's error numbers |
| `test/when.test.ts` | dates, with `TZ` pinned so the exact assertions mean the same thing anywhere |
| `test/live.test.ts` | the captured API shapes, and — with a key — the four commands against the live API |

The live checks need a key and skip without one, and **a skipped check is not
counted as a pass**:

```bash
LASTFM_KEY=<api key> LASTFM_USER=<username> npm test
```

With a key they assert that no artist name is lost anywhere and that a rejected
key raises rather than returning an empty list.
