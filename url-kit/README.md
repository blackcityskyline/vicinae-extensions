# URL Kit

Encode, decode or shorten a URL, or turn text into a QR code. No API key and no
configuration beyond where the result goes.

| Command | Does |
| --- | --- |
| URL Encode | percent-encodes the text for use as a value inside a URL |
| URL Decode | decodes percent-escapes, reading `+` as a space in the query only |
| Shorten URL | turns a link into a TinyURL link |
| Shorten URL from Argument | the same for a link handed in by a script or deeplink |
| Text to QR Code | shows the text as a QR code; copy it as an image or text |

The first four open a field prefilled with the argument or the clipboard; the
result is copied or pasted into the previous window, as **Result** says. Text to
QR Code shows the code immediately.

```sh
vicinae 'vicinae://extensions/@black/url-kit/shorten-url-withargs?url=https://example.com/a/long/path'
vicinae 'vicinae://extensions/@black/url-kit/qr?text=https://example.com'
```

## Preferences

| Preference | Values | Default |
| --- | --- | --- |
| Result | `Copy to Clipboard` or `Paste into Focused Window` | copy |

## Notes

- QR codes use level M, byte mode, UTF-8 and a four-module quiet zone, up to 2331
  bytes; the encoder is
  [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT)
  and the PNG is written here, in a per-process temp directory removed on exit.
  `iskra`'s Scan QR reads it back.
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
