# URL Kit

Encode, decode or shorten a URL, or turn text into a QR code. No API key, no
configuration beyond where the result goes.

| Command | What it does |
| --- | --- |
| URL Encode | Percent-encodes the text, for use as a value inside a URL |
| URL Decode | Decodes percent-escapes, reading `+` as a space inside the query string only |
| Shorten URL | Turns a link into a TinyURL link |
| Shorten URL from Argument | The same, for a link handed in by a script or a deeplink |
| Text to QR Code | Shows the text as a QR code; copy it as an image or as text |

The first four open a field prefilled with the argument, or with the clipboard when
there is none. Edit it if needed and confirm: the result is copied to the clipboard
or pasted into the window you came from, as the **Result** preference says.
`Text to QR Code` shows the code straight away, from its optional argument or the
clipboard.

```sh
vicinae 'vicinae://extensions/@black/url-kit/shorten-url-withargs?url=https://example.com/a/long/path'
vicinae 'vicinae://extensions/@black/url-kit/qr?text=https://example.com'
```

## Preferences

| Preference | Values | Default |
| --- | --- | --- |
| Result | `Copy to Clipboard`, or `Paste into Focused Window` (the window closes first, otherwise the text lands in the form) | `Copy to Clipboard` |

## QR codes

Level M error correction, byte mode, UTF-8, with the four-module quiet zone scanners
expect. Up to 2331 bytes; more is refused with a message. The encoder is
[`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT); the PNG is
written here. The image lives in a per-process temporary directory that is removed
on exit. Reading a QR code back is the `Scan QR Code` command of the `iskra` extension.

## What leaves your machine

Only `Shorten URL` and `Shorten URL from Argument` use the network: they send the
text to `tinyurl.com`, and only when it looks like a URL (`looksLikeUrl` in
`src/utils/url.ts`), so prose or a token left in the clipboard is not uploaded by
accident. Encode, decode and QR never touch the network.

## Why these are `view` commands

A `no-view` worker gets no clipboard on this platform (`Clipboard.readText()` answers
`""` and `Clipboard.copy()` writes nothing; see `../docs/api-porting.md`). A prefilled
field is the cheapest shape that works, and it stays editable.

## Behaviour worth knowing

- **`+` is a space only in the query.** `decodeURIComponent` alone leaves `?q=a+b`
  alone, though every web server reads it as `q=a b`. In the path and the fragment a
  `+` stays a plus.
- **A missing scheme is added** before shortening: TinyURL answers 400 for
  `example.com/some/path`.
- **TinyURL is the only shortener.** v.gd answered `Error, database insert failed` for
  12 of 12 links it had not seen before. It returns a working link only for a URL already
  in its cache, so a single check looks like success. The other services the upstream
  extension named were never implemented.
- **Selected text is not supported.** `getSelectedText()` is unreliable here in the same
  way as `readText()` in a `no-view` worker, so the input is the clipboard.

## Credits

Ported from Raycast; both upstreams are MIT:
[huzef44/url-tools](https://github.com/huzef44/url-tools) (encode, decode) and
[Visual-Studio-Coder/raycast-url-shortener](https://github.com/Visual-Studio-Coder/raycast-url-shortener)
(shortener).

## Development

```bash
npm install
npm run dev     # build, install and watch
npm run build   # type-check, bundle, install
npm run lint    # validate the manifest
npm run check   # tsc --noEmit with noUnusedLocals
npm test        # self-checks; the QR checks decode with zbarimg when it is installed
```
