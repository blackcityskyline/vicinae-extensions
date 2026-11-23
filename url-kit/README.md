# URL Kit

Encode, decode or shorten a URL, or turn text into a QR code. No API key and no
configuration beyond where the result goes.

| Command | Does |
| --- | --- |
| URL Encode | percent-encodes the text for use as a value inside a URL |
| URL Decode | decodes percent-escapes, reading `+` as a space in the query only |
| Shorten URL | turns a link into a TinyURL link |
| Shorten URL from Argument | the same for a link handed in by a script or deeplink |
| Text to QR Code | a text field, then the text as a QR code; copy it as an image or text |
| QR Code to Text | reads the codes in an image: the argument's path, the clipboard's image, or a copied path; `ctrl+o` opens a file picker |

The first four open a field prefilled with the argument or the clipboard; the
result is copied or pasted into the previous window, as **Result** says. Text to
QR Code opens a field of its own, prefilled from the argument or the clipboard
but meant to be typed into; **Edit Text** (`ctrl+e`) brings it back. QR Code to
Text is its other half and reads every code in the image, one per line. When the image is in neither the argument
nor the clipboard, `ctrl+o` opens the form: the file picker, or a path typed by
hand, checked before it is read.

```sh
vicinae 'vicinae://extensions/@black/url-kit/shorten-url-withargs?url=https://example.com/a/long/path'
vicinae 'vicinae://extensions/@black/url-kit/qr?text=https://example.com'
vicinae 'vicinae://extensions/@black/url-kit/qr-to-text?image=/tmp/code.png'
```

## Preferences

| Preference | Values | Default |
| --- | --- | --- |
| Result | `Copy to Clipboard` or `Paste into Focused Window` | copy |

## Notes

- Reading a QR image needs `zbarimg` (package `zbar`), the same tool `iskra` uses;
  a code that is only on screen is `iskra`'s Scan QR, which captures a region.
- QR codes use level M, byte mode, UTF-8 and a four-module quiet zone, up to 2331
  bytes; the encoder is
  [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT)
  and the PNG is written here, in a per-process temp directory removed on exit.
  `iskra`'s Scan QR reads it back.
- `qrcode-generator` 2.0.4 ships two builds and they differ: only the CommonJS
  one has `stringToBytesFuncs`. The bundler takes the ESM one, so the UTF-8 bytes
  come from `TextEncoder` here; reading the library's map crashed the installed
  `qr` command while every test was green, because `tsx` resolves the CommonJS
  build.
- Only the shortening commands use the network: `tinyurl.com`, and only when the
  text looks like a URL, so prose in the clipboard is not uploaded. v.gd was
  dropped after answering `database insert failed` for 12 of 12 new links.
- `+` decodes as a space only in the query string; a missing scheme is added
  before shortening.
- Selected text is not used: `getSelectedText()` is unreliable here like
  `readText()` in a `no-view` worker, so the input is the clipboard.
- These are `view` commands because a `no-view` worker gets no clipboard on this
  platform; the prefilled field stays editable.

Ported from [huzef44/url-tools](https://github.com/huzef44/url-tools) and
[Visual-Studio-Coder/raycast-url-shortener](https://github.com/Visual-Studio-Coder/raycast-url-shortener),
both MIT.
