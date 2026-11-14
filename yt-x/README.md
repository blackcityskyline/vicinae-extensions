# yt-x

A launcher front end for the [yt-x](https://github.com/Benexl/yt-x) CLI: the same
feeds, library, channel tabs, playlists, search filters and custom commands as
Vicinae lists instead of `fzf` and `gum` prompts. It is not a fork: it reads the
config and state yt-x writes and runs the same `yt-dlp` and player commands.
Where a flow needs the terminal UI, `Miscellaneous → Open yt-x` hands it back.

## Command

`Browse YouTube`. An empty search bar is yt-x's main menu; two characters search
YouTube as you type. Every list is two panes: titles on the left, the selected
row's thumbnail and metadata on the right.

Root rows: Feeds (Your Feed, Subscriptions), Library (Watch Later, Liked, Watch
History, Clips, Recent, My Videos, My Playlists, Channels), Playlists, and
Miscellaneous. Remote views page through `yt-dlp`; the launcher filters what is
loaded, and a new term goes back to YouTube.

## Search

Queries go through YouTube's search page, so the inline filters work:
`:hour :today :week :month :year`, `:video :movie :live :short :long`,
`:4k :hd :subtitles :360 :vr :3d :hdr :local`, `:newest :views :rating`.
`!1`, `!2` recall past searches. With `CONFIG_ENABLE_SEARCH_HISTORY=true` the
searches are written to `$XDG_CACHE_HOME/yt-x/search-history.txt`.

## Actions

On a video: Play (detached; with Play Up Next it starts the related list too),
Play with Up Next (`ctrl+shift+u`, one `.m3u` that advances by itself), Listen,
Mix, Related Videos, Comments (threads and replies, reply and post with
`ctrl+t` / `ctrl+n`), Download Video or Audio, Save to yt-x, the Playlist block,
Go to Channel, Open in Browser, Copy URL. Play and Listen update
`my/recents.json`.

On a channel: Videos plus a tab submenu (Featured, Playlists, Shorts, Streams,
Podcasts), Search This Channel, Open in Browser, Copy Channel URL. On a
playlist: open, save, open in browser, copy URL.

## Config

`~/.config/yt-x/config` (`$XDG_CONFIG_HOME` respected), parsed as assignments,
never sourced: `CONFIG_PLAYER` (mpv when unset), the per-player argument
variables, `CONFIG_YT_DLP_OPTS` (listings only), `CONFIG_DOWNLOAD_DIR`,
`CONFIG_BROWSER`, `CONFIG_PER_PAGE` (1–50), `CONFIG_EDITOR`,
`CONFIG_NO_OF_RECENT`, `CONFIG_DOWNLOADS_ENUMERATE`,
`CONFIG_ENABLE_SEARCH_HISTORY`. `YT_X_*` environment variables win over the file.

State lives in `~/.config/yt-x/my/{recents,videos,subscriptions,playlists,cmds}.json`;
when a file is absent its legacy counterpart is read. Writes go through a temp
file and `rename`. A file that cannot be parsed is reported with its path and
the rest of the library still loads.

`Play Up Next` defaults to on; `Play with Up Next` overrides it; `Listen` stays
one video.

## Differences from yt-x

- No fzf/gum menus, previews, themes, languages, extensions or update check.
- No trusted `Shell` action, no `Subscribe To Channel` (yt-x reports it
  unsupported), no Trending (yt-dlp no longer resolves it).
- The player is always detached; the playlist name prompt is prefilled with the
  listing title.
- Mix playback plays the URL directly instead of writing an `.m3u8`.

## Requirements

`yt-x` (0.8.7 measured), `yt-dlp`, `mpv` or whatever `CONFIG_PLAYER` names,
`ffmpeg` for MP3, and `sqlite3` for Related Videos (it reads a Firefox-based
browser's cookies; without it the list is the guest one). Without `yt-x` the
extension still searches, plays and writes its own state.

## Not verified

Play, Listen, Download, the terminal entries and the forms were not pressed from
the UI; their argv and file writes are checked in `test/yt-x.test.ts`. Pane
rendering was not inspected by an agent.

yt-x is [Benexl/yt-x](https://github.com/Benexl/yt-x), MIT.
