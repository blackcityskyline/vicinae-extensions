# dpaste

Create a paste on [dpaste.com](https://dpaste.com) and put the link on the
clipboard. No account, no API key.

| Command | Does |
| --- | --- |
| Create Paste | a form with the clipboard prefilled; the created link replaces it |

The form takes the content, an optional title, a syntax from dpaste's published
list and an expiry from 1 to 365 days. Syntax and expiry are remembered between
runs; content and title are not. `ctrl+s` submits.

The link is unlisted, not private: anyone with the URL can read the paste, and
the form says so before anything is sent. One `POST` to `dpaste.com/api/v2/`
leaves the machine with the content, title, syntax and expiry; the clipboard is
read locally.

There is no list command: anonymous pastes cannot be listed, so upstream's
second `pastebin` command is gone rather than turned into a screen that only
works after signing up.

Written from scratch; the API behaviour was measured and is recorded in
[`docs/audits/dpaste.md`](../docs/audits/dpaste.md).
