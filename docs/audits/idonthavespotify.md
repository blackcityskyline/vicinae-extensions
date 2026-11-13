# Audit: `idonthavespotify` ← `sjdonado/idonthavespotify`

[sjdonado/idonthavespotify](https://github.com/sjdonado/idonthavespotify) (MIT, `e65bca2`,
2026-10-15) is not an Omarchy widget: it is a Bun/TypeScript server, a server-rendered web app, and
a public instance at `https://idonthavespotify.sjdonado.com`. It converts a music link from one
streaming service into links to the same content on the others.

The repository is 6 071 lines of TypeScript (3 419 of them parsers and adapters), 26 test files and
an e2e suite. It also ships a Raycast extension (`raycast/extensions`, `1.0.0`):

- one view command, *Convert Link to All Platforms*: clipboard link → result list;
- eight `no-view` commands, one per destination, which copy the converted link and show nothing.

There is nothing to port line by line: the conversion is HTTP. What a launcher needs is the Raycast
extension's shape plus the API's real behaviour.

## The instance problem, measured

The public instance does **not** answer programmatic search:

| Request | Measured |
| --- | --- |
| `GET /api/status` | **200**, `{"serviceGuards":{},"timestamp":"…","gate":{"enabled":false}}` |
| `POST /api/search?v=1` | **403** with a Cloudflare `Just a moment…` HTML challenge, not JSON, with and without a browser `User-Agent` |

The upstream docs say the Worker sets `DISABLE_API_SEARCH=true`, so the API answers 403 before
validation; Cloudflare's WAF challenge arrives first. Either way there is no keyless public convert
endpoint. The Raycast extension has the same constraint and documents a *Self-Hosted Instance URL*
preference.

So this extension cannot work out of the box: it needs the owner's instance. That is the whole
reason the preference exists, and the empty window must say so rather than showing a failed request
against a host that will never answer.

## The API, measured against a local instance

The upstream was built and run here (`bun run build`, `bun run src/index.ts` on port 3111) with
`.env.test`, so these are real responses, not the README's examples:

| Thing | Measured |
| --- | --- |
| success | `POST /api/search?v=1` with `{"link": "https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc", "adapters": ["appleMusic","deezer","soundCloud"]}` → **200** in 1.0 s |
| body | `{id, type: "song", title, description: "Bob Dylan · Song · 1965", image, audio, source, universalLink, links: [{type, url, isVerified, notAvailable}]}` |
| everything | the same link with no `adapters` → **200** in 5.36 s, 9 links: `appleMusic, bandcamp, deezer, pandora, qobuz, soundCloud, spotify, tidal, jiosaavn` |
| flags | `isVerified: true` on the strong matches; `notAvailable` is `true` for a result below the confidence floor and `undefined` otherwise; one link (JioSaavn) can carry `isVerified: false` while still having a usable URL |
| universal link | `universalLink` is the instance's own `APP_URL` plus the encoded id (`http://localhost:3000?id=…`), so it is only as public as the instance |
| bad link | **400** `{"error":"Invalid link, please check ALLOWED_LINKS_REGEX"}` — an internal name in a user-facing message |
| missing version | **400** `{"error":"API version required"}` |
| YouTube source without a key | **500** in 0.23 s, the Google API's `API key not valid` inside the error text. A self-hosted instance that wants YouTube input needs `YOUTUBE_API_KEY`; the adapters for other services work without it |
| rate limit | none per IP in the app; upstream asks operators to put one in front of a public instance |

`adapters` is optional, and the destination names are `spotify`, `youTube`, `appleMusic`, `deezer`,
`soundCloud`, `tidal`, `qobuz`, `bandcamp`, `pandora`, `jiosaavn`, `applePodcasts`, `podcastFeed`,
`invidious`. The extension does not need to send it: the instance's default is everything, which is
what a "convert this link" command wants, and a per-destination preference would only ever hide
rows.

## Input URL shapes

The parsers accept these sources (`src/config/constants.ts`), which is also the local validation the
extension can do before spending a request:

| Service | Accepted shape |
| --- | --- |
| Spotify | `https://open.spotify.com/[intl-xx/]{track,album,playlist,artist,episode,show}/<11–24 chars>` or `https://spotify.link/<id>` (short links are resolved server-side) |
| YouTube | `youtube.com/watch?v=…`, `/embed/…`, `/v/…`, `/shorts/…`, `playlist?list=…`, `/channel/…`, `youtu.be/…`, `music.youtube.com/…` |
| Apple Music | `https://[geo.]music.apple.com/[xx[-xx]/]{album,playlist,station,artist,music-video,video-playlist,show,song}/…` |
| Deezer | `https://www.deezer.com/[xx/]{track,album,playlist,artist,episode,show}/<digits>` |
| SoundCloud | `https://soundcloud.com/<user>/<track>[/sets/<set>]` or `https://on.soundcloud.com/<id>` |
| Tidal | `https://tidal.com/browse/{track,artist,album,mix,video}/<id>` |
| Qobuz | `https://{open,play,www}.qobuz.com/[xx-xx/]{artist,album,interpreter,track}/…` |
| Bandcamp | `https://<artist>.bandcamp.com/{album,track}/<slug>` |
| Pandora | `https://[www.]pandora.com/{playlist,podcast,artist}/…` |
| JioSaavn | `https://[www.]jiosaavn.com/{song,album,artist,featured,playlist}/…` |
| Apple Podcasts | `https://podcasts.apple.com/[xx/]podcast/…/id<digits>[?i=<episode>]` |
| Google share | `https://www.google.com/gasearch…` or `https://share.google/<id>` |

All patterns are anchored to `https://`. A pasted `http://` link, a playlist on a service that only
serves songs, or plain text is not sent: the extension's validation is the upstream regex, so the
answer is immediate and local.

## What maps to what

| Upstream | Here | Why |
| --- | --- | --- |
| web page: paste a link, server-rendered card | one `List` whose search bar is the link field, validated locally | a launcher's list is the page |
| Raycast view command: clipboard → search-as-you-type with a request per keystroke | clipboard prefill, then a request only when the text is a complete supported link | the same request per keystroke would call a slow, rate-limited instance on every character |
| eight Raycast `no-view` converters ("copy to Spotify", …) | **cut**; every destination gets `Copy Link` in one result list | a Vicinae `no-view` command has no clipboard to read (measured elsewhere in this repo), and the list already shows every destination at once |
| audio preview via `play-sound` | **cut** | Vicinae has no audio playback; the instance's `audio` URL is still in the response and could be opened |
| cached last search in `LocalStorage` | **cut** | one keystroke away from a fresh result; the request is the only cost |
| result card: cover, title, description, universal link, verified check | a header row with the cover image and description, `Open on Website` for the universal link | `ImageLike` exists for the cover; the universal link needs one action, not a badge |
| `notAvailable: true` destinations | filtered out | upstream keeps them to show a disabled row; a list has no disabled state |
| instance URL preference, public default | **required** `instanceUrl` preference | the public instance refuses API search; a default that always fails is worse than an empty field with an explanation |
| web UI, htmx, Workers, self-hosting | **cut** | not a launcher's job |

## Shape

One view command, `idonthavespotify`:

- preferences: `instanceUrl` (required) — the base URL of the owner's instance;
- the search bar takes a link; on open the clipboard is read and, if it holds a supported link, the
  conversion starts by itself;
- result: a row with the cover, title, description and type, plus a `Listen on` section, one row per
  destination that has a usable URL, with `isVerified` marked;
- actions: `Open` (`ctrl+o`) and `Copy Link` (`ctrl+c`) per destination, `Open on Website` and
  `Copy Universal Link` on the result row, `Open Preferences` (`ctrl+,`);
- an empty window says what the instance is and links to the upstream self-hosting docs; an error
  row carries the instance's message, with the 400's internal regex name translated.

## Live launch

`vicinae 'vicinae://launch/@black/idonthavespotify/idonthavespotify'` against the local build on
`http://localhost:3111`, 2026-11-13, `instanceUrl` set in `~/.config/vicinae/settings.json` for the
run and removed afterwards:

- the clipboard held `https://open.spotify.com/track/3AhXZa8sUQht0UEdBJgpGc`, and the window
  converted it without a keystroke: a **Song** section with a cover, *Like a Rolling Stone* and
  *Bob Dylan · Song · 1965*, then `Listen on` with Apple Music, Bandcamp, Deezer, Pandora, Qobuz,
  SoundCloud and Spotify — the seven URLs the instance returned with a usable link, its
  `notAvailable` rows absent;
- typing `x` replaced the list with *Not a supported link* and the supported-services line, which
  is the local validator refusing before any request;
- the first launch showed the required-preference form, not the list, because the provider entry
  was written before the manifest's `required` flag was seen; after saving it behaved as above;
- **Vicinae 0.30 ignores the List `searchText` prop.** A constant `"HELLO"` still rendered the
  placeholder, so the value the command sets from the clipboard never reaches the search bar, while
  the clipboard conversion itself runs. The prop was removed rather than shipped dead, and the
  audit records it here because the `.d.ts` documents it as a controlled-component binding.

## Not verified

- **The public instance as a fallback.** It was measured and refused; nothing else about it was.
- **YouTube as a source** on a properly configured instance: without `YOUTUBE_API_KEY` it answers
  500, which is the error path, not the success path. The other adapters answered.
- **The self-hosting burden**: upstream needs Bun, its build step and a YouTube key for YouTube
  input. The README says so; the extension cannot install it.
