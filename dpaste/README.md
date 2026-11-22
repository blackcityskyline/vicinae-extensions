# dpaste

Create a paste on [dpaste.com](https://dpaste.com) and put its link on the
clipboard. No account, no API key.

| Command | Does |
| --- | --- |
| Create Paste | a form with the clipboard prefilled; the created link replaces it |

The form: content, optional title, syntax (dpaste's published list) and
expiry (1–365 days). Syntax and expiry are remembered between runs; content and
title are not. `ctrl+s` submits.

The link is unlisted, not private — anyone with the URL can read the paste, and
the form says so before sending. One `POST` to `dpaste.com/api/v2/` sends the
content, title, syntax and expiry; the clipboard is read locally.

No list command: anonymous pastes cannot be listed, so upstream's second
`pastebin` command was dropped, not turned into a screen that only works after
signing up.

Written from scratch.
