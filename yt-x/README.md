# yt-x

A launcher front end for the [yt-x](https://github.com/Benexl/yt-x) CLI installed on this
machine. It is a native port of yt-x 0.8.7's menus: the same feeds, library, channel tabs,
playlist actions, search filters and custom commands, as Vicinae lists instead of `fzf` and
`gum` prompts.

It is not a fork. It reads the config and state yt-x writes and runs the same `yt-dlp` and
player commands, so both see the same library and play the same way. Where a flow genuinely
needs yt-x's own prompts, `Miscellaneous → Open yt-x` hands the terminal UI back.

## Command

One command, `Browse YouTube`. With an empty search bar it is yt-x's main menu; typing two characters
searches YouTube as you type.

Every list is two panes: titles on the left, and on the right the selected row's thumbnail,
its title, its description when the listing carries one, and its channel, views or live
status, duration and publish date.

## The root list

| Section | Rows | yt-x equivalent |
| --- | --- | --- |
| Feeds | Your Feed, Subscriptions Feed | `Feed`, `Subscriptions Feed` |
| Library | Watch Later, Liked Videos, Watch History, Clips | the matching main-menu views |
| Library | Recent, My Videos, My Playlists, Channels | `Recent`, `My Videos`, `My Playlists`, `Channels` |
| Playlists | Playlists | `Playlists` (the account's playlists) |
| yt-x | Miscellaneous | `Miscellaneous` |

Every remote view is a paged `yt-dlp` listing: `Next page` loads the next `CONFIG_PER_PAGE`
entries. The launcher's own filter searches what is already loaded; a new term goes back to
YouTube.

Trending is absent on purpose: yt-x still lists it, but yt-dlp now answers `The
channel/playlist does not exist and the URL redirected to youtube.com home page`.

## Search

Type `drum and bass` and the debounced query is listed through YouTube's own search page
(`results?search_query=…&sp=…`), not `ytsearch`, so yt-x's inline filters work:

`:hour` `:today` `:week` `:month` `:year` · `:video` `:movie` `:live` `:short` `:long` ·
`:4k` `:hd` `:subtitles` `:360` `:vr` `:3d` `:hdr` `:local` · `:newest` `:views` `:rating`

The filter goes first or last, as in yt-x. `!1`, `!2`, … expand to a past search, newest
first, with anything typed after the number appended.

With `CONFIG_ENABLE_SEARCH_HISTORY=true` each debounced search is written to
`$XDG_CACHE_HOME/yt-x/search-history.txt`. Because a launcher searches while you type, the
growing prefixes of one search replace each other instead of stacking up; lookups, dedupe and
the 100-line cap are yt-x's.

## Actions

On a video:

| Action | What it does |
| --- | --- |
| Play | yt-x's player command, detached, so the media outlives the window |
| Listen | Same with mpv's `--no-video --force-window=no`; only when the player is mpv |
| Mix | Opens the video's auto-generated radio playlist (`list=RD<id>`) |
| Related Videos | The column YouTube shows next to the video: its own watch-next reply, signed with the browser's cookies so it is the personal list, without `yt-dlp` and without the playlist rows |
| Download Video / Download Audio | A detached `yt-dlp` into yt-x's `video/individual/<channel>/` or `audio/individual/<channel>/` |
| Save to yt-x / Remove from yt-x | Appends to or removes from `my/videos.json` |
| Playlist ▸ Play All, Listen to All, Download All, Download All Audio, Save/Unsave Playlist | The `Playlist` block yt-x shows while exploring a listing |
| Go to Channel | The channel page: avatar, subscriber count and description, then its tabs. The URL comes from the listing, or from `--print channel_url` |
| Open in Browser, Copy URL | The link |

Play and Listen update `my/recents.json`, capped by `CONFIG_NO_OF_RECENT`, as yt-x does.

On a channel: Videos, and an Open Tab submenu with Featured, Playlists, Shorts, Streams and
Podcasts, then Search This Channel, Open in Browser and Copy Channel URL. On a playlist: open
it, save or unsave it, open it in the browser, copy its URL.

## Downloads

Single videos use yt-x's exact command: cookies plus `--output`, nothing else — yt-x does not
pass `CONFIG_YT_DLP_OPTS` to downloads.

`Download All` uses a folder named after the listing title (yt-x prefills its name prompt with
that title), `--download-archive` at `$XDG_CACHE_HOME/yt-x/archives/<sha256 of "<kind> - <url>">`,
and the `%(playlist_index)s - ` prefix when `CONFIG_DOWNLOADS_ENUMERATE=true`. This means a
second `Download All` skips what the archive already holds, exactly as yt-x does.

The repository's `yt-dlp/` extension is still the one to use when the format or a progress
view matters.

## Miscellaneous

Explore Channels, Playlists, Shorts and Movies (the four searches yt-x hides here); Search
History with search, edit and clear; Custom Commands (`my/cmds.json`) with a form, an open
action and editing; Sync YouTube Subscriptions; and Edit Config, MPV Config, yt-dlp Config,
Custom Playlists and Search History in `CONFIG_EDITOR`, falling back to the desktop's default
app. `Open yt-x` runs the terminal UI.

Sync replaces `my/subscriptions.json` after a confirmation, as yt-x does. Unlike yt-x, it does
not demand a non-empty `CONFIG_BROWSER`: yt-dlp may already be configured with cookies (as it
is on this machine).

## What it reads and writes

`~/.config/yt-x/config` (`$XDG_CONFIG_HOME` is respected), parsed as assignments, never
sourced:

| Setting | Used for |
| --- | --- |
| `CONFIG_PLAYER` | the player command; `mpv` when unset |
| `CONFIG_MPV_ARGS`, `CONFIG_VLC_ARGS`, `CONFIG_TPLAY_ARGS` | extra player arguments, split like a shell splits them |
| `CONFIG_YT_DLP_OPTS` | extra options for listings only |
| `CONFIG_DOWNLOAD_DIR` | where downloads go; `~/Videos/yt-x` when unset |
| `CONFIG_BROWSER` | `--cookies-from-browser` for yt-dlp |
| `CONFIG_PER_PAGE` | page size, clamped to 1–50 |
| `CONFIG_EDITOR` | the editor for the file actions; `$EDITOR` when unset |
| `CONFIG_NO_OF_RECENT` | how many entries `my/recents.json` keeps |
| `CONFIG_DOWNLOADS_ENUMERATE` | the playlist-index filename prefix |
| `CONFIG_ENABLE_SEARCH_HISTORY` | whether searches are recorded |

`YT_X_*` environment variables win over the file, as inside yt-x.

State is `~/.config/yt-x/my/{recents,videos,subscriptions,playlists,cmds}.json`. yt-x 0.8.7
ignores the older flat files next to that directory; when a `my/` file is **absent**, this
extension reads its legacy counterpart (`recent.json`, `saved-videos.json`,
`subscriptions.json`, `custom-playlists.json`) so an existing library is not lost. Writes go
to the current files, through a temporary file and `rename`, so yt-x never reads a half-written
list. Unsaving removes the entry from both files when it is in both.

A file that exists but cannot be parsed is reported in a toast with its path; the rest of the
library still loads.

## Differences from yt-x

| yt-x | Here | Why |
| --- | --- | --- |
| fzf/gum menus, previews, themes, languages, extensions, update check | none | terminal UI; the launcher replaces the menus |
| Trusted `Shell` action | none | it exposes the current listing's state variables in a subshell |
| `Subscribe To Channel` | none | yt-x itself answers that it is unsupported |
| `Toggle Enumerate Downloads` | config only | yt-x flips it for the life of one session; here the config value is read |
| `CONFIG_DISOWN_PLAYER` | always detached | a launcher must not hold the player |
| Playlist name prompt | the listing title | the prompt is prefilled with that title |
| Mix playback writes an `.m3u8` in the cache | the mix URL is played directly | the player resolves the radio playlist itself |
| Trending | absent | yt-dlp no longer resolves it |
| Search history in a terminal prompt | inline filters and `!n` recall | same results without a prompt |

## Requirements

- `yt-x` in `PATH` (0.8.7 measured), for its config, state and terminal fallback
- `yt-dlp` in `PATH`
- `mpv`, or whatever `CONFIG_PLAYER` names
- `ffmpeg` for MP3 downloads
- Cookies from the browser named by `CONFIG_BROWSER` or yt-dlp's own config, if the site needs
  a session
- `sqlite3` for `Related Videos`: a Firefox-based browser (Firefox, Zen, LibreWolf) keeps its
  cookies in SQLite, and the column reads that file; without it the column is the guest one

Without `yt-x` the extension still searches, plays and writes its own state; without `yt-dlp`
it reports that it is missing.

## Privacy

Everything is local. yt-dlp contacts YouTube (and whatever URL a saved playlist points at) to
search and list; the player contacts the site it plays. Nothing is sent anywhere else, and
there is no telemetry.

## Not verified

- The launcher UI was not visually inspected by the agent: screen capture here does not include
  the launcher surface. The owner opened `Related Videos` from a video's action panel and saw
  the rows render. The command loads (`Loaded extension yt-x:browse`, no error after it), and
  the render payload was accepted with no `parseRenderPayload` warning, but the panes and the
  detail pane were not seen.
- Play, Listen, Download, the terminal entries and the forms were not pressed from the UI.
  Their argv and file writes are checked in `test/yt-x.test.ts`, and the listings were run
  against the real yt-dlp and this machine's yt-x state.
- The mix `.m3u8` difference and the download archive are described from yt-x's source; no
  file was downloaded through the UI to watch the archive fill.

## Attribution

yt-x is [Benexl/yt-x](https://github.com/Benexl/yt-x), MIT. This extension only invokes it and
reads its files.

