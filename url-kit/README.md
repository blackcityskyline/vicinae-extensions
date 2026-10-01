# URL Kit

Encode, decode or shorten a URL from the clipboard. Three commands, no
configuration, no API key.

| Command | What it does |
| --- | --- |
| URL Encode | Percent-encodes the clipboard so it can be used as a URL value |
| URL Decode | Decodes percent-escapes in the clipboard |
| Shorten URL | Replaces the clipboard with a TinyURL link to it |

All three open a field prefilled with the clipboard, transform what is in it and
put the result back on the clipboard.

## Why they are not `no-view`

Upstream makes all of them `no-view`: copy something, press the hotkey, act,
close. That shape does not work here — `Clipboard.readText()` in a `no-view`
worker returns `""` on this machine whatever the clipboard holds, so there is
nothing to read. A prefilled field is the cheapest shape that does work, and it
stays editable, so a hand-pasted URL works as well as a copied one. The
measurement is in `../docs/api-porting.md`.

## What leaves your machine

`Shorten URL` sends the clipboard's contents to `tinyurl.com` and nothing else
does. `looksLikeUrl` in `src/utils/url.ts` refuses anything that is not a URL
before the request is made, so prose or a token left in the clipboard is not
uploaded by accident. Encode and decode never touch the network.

## Ported from Raycast

Upstream, both MIT:

- [huzef44/url-tools](https://github.com/huzef44/url-tools) — the encode and
  decode commands
- [Visual-Studio-Coder/raycast-url-shortener](https://github.com/Visual-Studio-Coder/raycast-url-shortener)
  — the shortener

### What changed

**`+` is decoded where it means a space.** Upstream calls
`decodeURIComponent(clipboard)` on the whole string, which leaves `?q=a+b`
alone even though every web server reads that as `q=a b`. `decodeUrl` decodes
`+` to a space inside the query string and leaves it a literal plus in the
path and the fragment.

**The `domain` preference is missing, and the reason on record was wrong.**
The upstream description promised `tinyurl.com`, `shrtco.de`, `9qr.de` and
`shiny.link`, but its code only ever implemented two branches — TinyURL and
v.gd. An earlier note here claimed v.gd answered
`Error, database insert failed` on 8 of 8 and dropped the dropdown for that
reason. Re-measured, that is no longer true:

| Service | Result |
| --- | --- |
| `tinyurl.com/api-create.php` | 200, keyless, 3 of 3 |
| `v.gd/create.php` | 200, keyless, 3 of 3 |
| `shrtco.de/shorten` | 200, but serves an HTML page |
| `9qr.de` | 200 on `/`, HTML on the API path |
| `shiny.link` | no answer |

So both backends upstream implements work, and the dropdown that was dropped
on a stale measurement should come back: one preference, one more branch in
`src/api/shorten.ts`.

**`showHUD` became a toast on failure.** Upstream swallows every error that is
not a string, so a failed shorten leaves the clipboard unchanged and says
nothing. Every failure here names what failed.

**Input comes from the clipboard, not the selection.** On Wayland reading the
primary selection is compositor-dependent, and the clipboard is what the other
two commands already use.

**A missing scheme is added.** TinyURL answers 400 for `example.com/some/path`
and 200 for `example.com`, so a bare domain goes out as `https://example.com/…`
instead of being left to come back rejected.

### Dropped

- The `domain` and `clipboard` preferences (see above; also, `Clipboard.paste`
  into an arbitrary window is not something this extension needs to offer when
  the shortened link is one `cmd+V` away).
- The second command that took the URL as an argument. The clipboard is already
  the input for the other two commands, and one command that reads it beats two
  that differ only in where the URL comes from.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

```bash
vicinae 'vicinae://launch/@black/url-kit/decode'
```
