# dpaste

Create a paste on [dpaste.com](https://dpaste.com) and put the link on the
clipboard. No account, no API key, no trust-store setup.

| Command | What it does |
| --- | --- |
| Create Paste | Form with the clipboard prefilled; the created link replaces it |

The form takes the content, an optional title, a syntax from dpaste's published
list, and an expiry from 1 to 365 days. Syntax and expiry are remembered between
runs; content and title are not.

## One command, not the two of `pastebin`

`pastebin` upstream has a second command that lists your pastes. That needs an
account and an API key, and dpaste's anonymous items cannot be listed without
one either. So the list command is gone rather than translated into a screen
that only works after signing up.

## The link is unlisted, not private

dpaste's items are reachable by anyone who has the URL; the links are not
published in a directory. The form says so before anything is sent. The link is
copied to the clipboard on success and a HUD shows it.

## What leaves your machine

One `POST` to `dpaste.com/api/v2/` with the content, title, syntax and expiry you
submitted. Nothing else is sent, and reading the clipboard happens locally.

## Written from scratch

The extension was in the roadmap as a replacement for Raycast's `pastebin`, whose
preferences are all required and whose API needs a key. dpaste's API v2 takes an
unauthenticated form POST. The interface is this repository's own, not a port.
