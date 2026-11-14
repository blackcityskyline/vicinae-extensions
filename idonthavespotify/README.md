# I Don't Have Spotify

Convert a music link into links to the same track, album, artist, podcast or show
on the other streaming services.

A Vicinae front end for [`sjdonado/idonthavespotify`](https://github.com/sjdonado/idonthavespotify):
the conversion is one HTTP request to an instance, with no matching done here.

## Command

| Command | Does |
| --- | --- |
| I Don't Have Spotify | paste a music link and see where the same content is available |

Actions: Open the destination, Copy Link, Open the instance's share page, Copy
Universal Link, Open Preferences.

## Setup: an instance is required

The public site does not answer programmatic search — its API is disabled on the
Worker and sits behind Cloudflare, so scripts get a 403 challenge. The extension
therefore asks for a self-hosted **instance URL** and shows a setup screen
without one:

```bash
git clone https://github.com/sjdonado/idonthavespotify
cd idonthavespotify && bun install
cp .env.test .env        # set APP_URL, and YOUTUBE_API_KEY for YouTube links
bun run build && bun run src/index.ts
```

Point the preference at it, e.g. `http://localhost:3000`. `DISABLE_API_SEARCH`
must stay unset, and a public instance should sit behind a rate limiter.

## How it works

On open the clipboard is read; a supported link starts converting by itself, and
a typed link is sent once complete. The input is checked locally against the
services upstream parses before any request.

The answer is the source item (cover, title, artist, type) and `Listen on`, one
row per destination with a check for a verified match; destinations the instance
marks unavailable are left out. Supported inputs: Spotify, YouTube, Apple Music,
Deezer, SoundCloud, Tidal, Qobuz, Bandcamp, Pandora, JioSaavn, Apple Podcasts and
Google share links; `spotify.link` is resolved by the instance. Audio previews
are cut, since Vicinae has no audio playback.

## Not verified

Every check runs against recorded fixtures; the live run used a local instance,
not a production deployment. YouTube as a source needs an API key this machine
does not have, so only its error path was seen.
