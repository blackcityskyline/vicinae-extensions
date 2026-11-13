# I Don't Have Spotify

Convert a music link into links to the same track, album, artist, podcast or show on the other
streaming services.

It is a Vicinae front end for [`sjdonado/idonthavespotify`](https://github.com/sjdonado/idonthavespotify),
the same author's web app and Raycast extension. The conversion is one HTTP request to an
[*I Don't Have Spotify*](https://github.com/sjdonado/idonthavespotify) instance; this extension
does no matching of its own.

## Command

| Command                  | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| **I Don't Have Spotify** | Paste a music link and see where the same content is available |

## Actions

| Action              | Shortcut | Description                                              |
| ------------------- | -------- | -------------------------------------------------------- |
| Open                | `ctrl+o` | The destination link                                     |
| Copy Link           | `ctrl+c` | The destination link, ready to paste                     |
| Open on Website     | `ctrl+o` | The instance's own share page for the result             |
| Copy Universal Link | `ctrl+c` | That share page, for someone who has not chosen a service |
| Open Preferences    | `ctrl+,` | Change the instance URL                                  |

## Setup: an instance is required

The public site (`https://idonthavespotify.sjdonado.com`) **does not answer programmatic search**:
its API is disabled on the Worker and sits behind Cloudflare, so every request from a script gets a
403 challenge. This was measured with and without a browser user agent; the upstream README says
the same. The extension therefore asks for a **self-hosted instance URL** and shows a setup screen
when it is missing.

Running one is upstream's job, not this extension's:

```bash
git clone https://github.com/sjdonado/idonthavespotify
cd idonthavespotify && bun install
cp .env.test .env        # then set APP_URL, and YOUTUBE_API_KEY for YouTube links
bun run build && bun run src/index.ts
```

The instance defaults to port 3000; point the preference at it, e.g. `http://localhost:3000`. A
compiled binary and a Docker image are in the upstream docs. YouTube **as a source** needs a
`YOUTUBE_API_KEY`; the other services work without one. `DISABLE_API_SEARCH` must stay unset.

If the instance is reachable from other machines, put a rate limiter in front of it: upstream has
none.

## How it works

The search bar takes a link. On open the clipboard is read; if it holds a supported link the
conversion starts by itself, and a link typed or pasted into the bar is sent once it is complete.
The link is checked locally against the services upstream parses before any request, so a mistyped
or `http://` link costs nothing.

The answer becomes two sections: the source item (cover, title, artist or description, type) and
`Listen on`, one row per destination with its URL and a check for a verified match. Destinations the
instance itself marks as not available are left out — a list has no disabled state.

Supported inputs: Spotify, YouTube, Apple Music, Deezer, SoundCloud, Tidal, Qobuz, Bandcamp,
Pandora, JioSaavn, Apple Podcasts and Google share links. Spotify short links (`spotify.link`) are
resolved by the instance.

Audio previews are cut: Vicinae has no audio playback. The instance's universal link is still one
action away if you want the web card.

## Requirements

- A self-hosted instance (above) and its base URL.
- Nothing else: the extension has no dependency beyond `@vicinae/api`.

## Not verified

Every request in the checks is a fixture recorded from a local instance; the live run used a local
instance on 3111, not a production deployment. YouTube as a source needs a real API key that this
machine does not have, so only its 500 error path was seen. See
[`docs/audits/idonthavespotify.md`](../docs/audits/idonthavespotify.md).
