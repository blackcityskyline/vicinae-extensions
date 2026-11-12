# Audit: `yt-x` — a native port of the CLI's menus

Measured on 2026-11-11 against the machine this extension is installed on. The goal was the
whole of yt-x, not a browse-only wrapper.

## The tool

| Fact | Value |
| --- | --- |
| `yt-x` | `/usr/bin/yt-x`, version 0.8.7, MIT, [Benexl/yt-x](https://github.com/Benexl/yt-x) |
| Script size | 4883 lines, 201 shell functions |
| Installed script vs upstream `main` | different (md5 `a5a7ee23…` vs upstream 4942 lines); `main` adds a "Copy Video URL" action, a `viu` preview renderer and a clipboard helper, none of which touch the files read here |
| `yt-dlp` | 2026.10.26 |
| player | `mpv` `v0.41.0-dirty`, `CONFIG_PLAYER="mpv"` |
| `ffmpeg` | n9.0.2, needed for MP3 downloads |
| config | `~/.config/yt-x/config`; defaults used here: no player args, no yt-dlp options, `CONFIG_BROWSER=""`, `CONFIG_PER_PAGE=30`, `CONFIG_NO_OF_RECENT=10`, `CONFIG_DOWNLOADS_ENUMERATE=false`, `CONFIG_ENABLE_SEARCH_HISTORY=true`, `CONFIG_EDITOR="$EDITOR"`, `CONFIG_DOWNLOAD_DIR=/home/black/Videos/yt-x` |
| state | `~/.config/yt-x/my/` exists but is empty; the legacy files hold 10 recents, 1 saved video, 1 channel, 1 custom playlist |
| cookies | none in yt-x config; `~/.config/yt-dlp/config` supplies `--cookies-from-browser=firefox:…zen…`, so feeds, liked, watch later and history work with `CONFIG_BROWSER=""` |

yt-x has no non-interactive way to play or download an arbitrary URL (`-sv` addresses a saved
video by title and search shortcuts open a picker), so the port cannot call the CLI per row. It
runs the same `yt-dlp` and player commands the script runs. `Open yt-x` remains for the flows
that need its prompts.

## Menu map

yt-x's main menu, read from the `TXT_MENU_MAIN_*` block:

| yt-x | Here | Note |
| --- | --- | --- |
| `Feed` | Feeds ▸ Your Feed | `https://www.youtube.com/` |
| `Subscriptions Feed` | Feeds ▸ Subscriptions Feed | `feed/subscriptions` |
| `Playlists` | Playlists ▸ Playlists | `feed/playlists` |
| `Search` | the search bar | filters and `!n` recall included |
| `Watch Later` | Library ▸ Watch Later | `playlist?list=WL` |
| `Channels` | Library ▸ Channels | `my/subscriptions.json` |
| `My Playlists` | Library ▸ My Playlists | `my/playlists.json` |
| `Liked Videos` | Library ▸ Liked Videos | `playlist?list=LL` |
| `My Videos` | Library ▸ My Videos | `my/videos.json` |
| `Recent` | Library ▸ Recent | `my/recents.json` |
| `Watch History` | Library ▸ Watch History | `feed/history` |
| `Clips` | Library ▸ Clips | `feed/clips`; YouTube returned 0 entries here |
| `Edit Config` | Miscellaneous ▸ Files ▸ Edit Config | plus MPV, yt-dlp, playlists and search history |
| `Miscellaneous` | Miscellaneous | full submenu below |
| `Trending` | absent | see cuts |

Media actions, from `TXT_MENU_MEDIA_ACTIONS_*`: Watch → Play; Play All; Listen; Listen To All;
Mix; Save/UnSave; Save Playlist/UnSave Playlist; Go To Channel; Download; Download All;
Download (Audio Only); Download All (Audio Only); Open in Browser; Open in Browser (Playlist);
Subscribe To Channel; Toggle Enumerate Downloads; Shell.

Channel actions: Videos, Featured, Search, Playlists, Shorts, Streams, Podcasts, Subscribe,
Open in Browser.

Miscellaneous: Explore Channels, Explore Playlists, Explore Shorts, Explore Movies, Search
History, Clear Search History, New Custom Command, Custom Commands, Edit Search History, Edit
Custom Playlists, Edit MPV Config, Edit yt-dlp Config, Edit Custom Commands, Sync YouTube
Subscriptions.

All of those exist here except the cuts below.

## Commands measured

Listing, exactly as `_fetch_media` builds it (`--extractor-args youtubetab:approximate_date`
included; the probe used this argv):

```
yt-dlp [--cookies-from-browser B] [CONFIG_YT_DLP_OPTS…] \
  --dump-single-json --flat-playlist --playlist-start N --playlist-end M \
  --extractor-args youtubetab:approximate_date <url>
```

Search is YouTube's search page, not `ytsearch`, so yt-x's `sp` filters apply:

```
https://www.youtube.com/results?search_query=drum%20and%20bass&sp=EgIIAg%253D%253D
```

| Probe | Result |
| --- | --- |
| search page 1, `drum and bass :today` | 30 entries |
| search page 2 (`--playlist-start 31 --playlist-end 60`) | 30 entries, disjoint from page 1 |
| `feed/subscriptions` | 30 entries |
| `feed/playlists` | 30 entries |
| one of those playlists | 30 entries |
| channel `/videos` | 26 entries |
| channel `/search?query=drum` | 3 entries |
| channel `/search?query=live` | 0 entries — the term, not the URL: `query=drum` on the same channel returns rows |
| `playlist?list=LL`, `playlist?list=WL`, `feed/history` | 2 entries each with a 2-entry page |
| `feed/clips` | 0 entries |
| `trending` | `ERROR: [youtube:tab] trending: … redirected to youtube.com home page` |

Pagination is yt-x's: `start = page_index * CONFIG_PER_PAGE + 1`, `end = start + CONFIG_PER_PAGE
- 1`, taken from `fetch_playlist_next`.

Filter ids are copied from `_parse_search_filter` and asserted in tests, for example
`today = EgIIAg%253D%253D`, `4k = EgJwAQ%253D%253D`, `newest = CAISAhAB`,
`views = CAMSAhAB`, `rating = CAESAhAB`, `channels = EgIQAg%253D%253D`,
`playlists = EgIQAw%253D%253D`, `shorts = EgIQCQ%253D%253D`, `movies = EgIQBA%253D%253D`.

Channel search is `channelUrl/search?query=…`, and "Search This Channel" lists it. The same
URL with the small channel above returned 0 for `live` and 3 for `drum`; the extension reports
the empty list and the next term works, so nothing was changed for it.

Playback (`__player_mpv`, non-Android branch):

```
mpv <url> [CONFIG_MPV_ARGS…] [--no-video --force-window=no]
```

Downloads (`_download_video`, `_download_audio`, then `__download_yt_dlp`):

```
yt-dlp <url> [--cookies-from-browser B] [--extract-audio --audio-format mp3] \
  --output <CONFIG_DOWNLOAD_DIR>/{video,audio}/individual/%(channel)s/%(title)s.%(ext)s
```

`__download_yt_dlp` passes only its arguments: single-video downloads get cookies and
`--output`, **not** `CONFIG_YT_DLP_OPTS`. The earlier wrapper included those options; the argv
now matches the script.

Playlist downloads (`_download_playlist_video`, `_download_playlist_audio`):

```
yt-dlp <playlist url> [--cookies-from-browser B] [--extract-audio --audio-format mp3] \
  --output <dir>/{video,audio}/<listing title>/%(channel)s/[%(playlist_index)s - ]%(title)s.%(ext)s \
  --download-archive <cache>/archives/<sha256 "<kind> - <url>">
```

The archive name is `_util_generate_hash "<kind> - <url>"`, measured:
`sha256("video - https://youtu.be/x") = 08e9d69dea5e15b08be066c2798fc641a947d6fbf044a507c5db50c543d82200`.
The folder name is yt-x's prompt default (`STATE_CURRENT_PLAYLIST_TITLE`); the prompt itself is
replaced by that title.

Sync subscriptions (`_fetch_yt_subs`) writes raw `--dump-single-json` output for
`https://www.youtube.com/feed/channels` into `my/subscriptions.json`. yt-x refuses when
`CONFIG_BROWSER` is empty; here cookies come from either the config or yt-dlp's own config, so
sync works on this machine, which has no `CONFIG_BROWSER`.

## Two-pane layout

yt-x previews a row with its fzf preview: the thumbnail plus the metadata it fetched. The port
renders every media list with Vicinae's `isShowingDetail`, so the left pane is titles only and
the right pane carries the thumbnail, the title again, and the rows yt-x's preview shows:
channel, views, live status or "Watching" count, duration and publish date. The values come
from the flat listing itself (`view_count`, `concurrent_view_count`, `live_status`,
`timestamp`/`release_timestamp`, `duration`), so no extra request is made per row.

The main menu is a list too, so its rows carry a short markdown description in the same pane;
without that, `isShowingDetail` would leave an empty side panel until a search runs.

`Go To Channel` used to open a page holding one bare row — no avatar, no data. The row is now
the channel itself: `fetchChannelInfo` runs the same listing call on `<channel>/videos` with
`--playlist-end 1` and reads the header yt-dlp puts at the top level of that JSON
(`channel`, `channel_url`, `channel_id`, `channel_follower_count`, `description`,
`thumbnails`). The pane shows the square avatar (the last thumbnail, `=s0`), the subscriber
count and the description; enter opens Videos. One extra yt-dlp run per channel page, none per
row; a listing that loses the header still falls back to the name on the video.

## The related column

`yt-dlp` answers one video, not its neighbours, so the right-hand column comes from YouTube's
own watch-next call. The watch page carries the innertube client every signed-out web request
uses — `"INNERTUBE_API_KEY":"AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"` and
`"clientVersion":"2.20261111.01.00"` — and the page holds zero `compactVideoRenderer` entries,
so the column is not in the HTML.

```
POST https://www.youtube.com/youtubei/v1/next?key=<key>&prettyPrint=false
{"context":{"client":{"clientName":"WEB","clientVersion":"2.20261111.01.00","hl":"en","gl":"US"}},"videoId":"dQw4w9WgXcQ"}
```

→ `200`, 20 rows under
`contents.twoColumnWatchNextResults.secondaryResults.secondaryResults.results`. Each is a
`lockupViewModel` carrying `contentId`, `contentType: LOCKUP_CONTENT_TYPE_VIDEO`, the title at
`metadata.lockupMetadataViewModel.title.content`, the channel in the first metadata row, the
duration as a `thumbnailBadgeViewModel` text (`3:24`) and two thumbnail sizes. Playlist lockups
(`LOCKUP_CONTENT_TYPE_PLAYLIST`, the "mix" rows) are dropped: they open a list, not a video.
No cookies, so the list is the guest one, and it is the same order the watch page shows.

The key and version are scraped from the first watch page the worker opens and kept for the
rest of that worker's life: one extra request per session, not per row. `Related Videos`
(`ctrl+shift+r`) opens the rows through the ordinary `VideoList`, so play, listen, download,
save and the channel link work on them unchanged.

### The personal list

Without cookies the reply is a generic list. The extension sends the browser's youtube.com
cookies, which is what the watch page itself sends, and signs the request the way Google's web
client does: `Authorization: SAPISIDHASH <time>_<sha1("<time> <SAPISID> https://www.youtube.com")>`.

The cookies cannot come from yt-dlp: its Firefox reader passes `expiry=0` for a session cookie,
which expires it in the jar, and a signed-in YouTube tab keeps `SID` and `SAPISID` as session
cookies (`expiry=0` in `moz_cookies`). Measured: `yt-dlp --cookies-from-browser firefox
--cookies <file> --simulate <video>` writes a jar where `.youtube.com` holds only `SOCS`,
`VISITOR_INFO1_LIVE`, `PREF` and friends — no `SID`, so a personal reply is impossible that way.

So the database is read directly instead, read-only and through `?immutable=1` because the
browser holds it open:

```
$ sqlite3 "file:~/.config/zen/<profile>/cookies.sqlite?immutable=1" \
    "select name, length(value) from moz_cookies where host like '%youtube.com' and name in ('SID','SAPISID','LOGIN_INFO')"
SAPISID|34
SID|153
LOGIN_INFO|319
```

`mode=ro` fails with `database is locked (5)` while the browser runs; `immutable=1` reads the
main database and skips the WAL, which is where the newest non-session cookies live — the
session ones this needs are committed.

The browser is the one `CONFIG_BROWSER` names, and when that is empty, the one the global
yt-dlp config names (`--cookies-from-browser=firefox:~/.config/zen/<profile>` on this machine).
Only Firefox-based browsers are read this way; a Chromium cookie is encrypted with the keyring,
and there the column falls back to the guest list rather than failing. As measured, the guest
reply for `dQw4w9WgXcQ` held `Rick Astley - Together Forever`, `Scatman`, `Moskau`; the signed
reply held the mixes and the history that the watch page shows a signed-in tab. No cookie is
written anywhere: the values go from the database into one request header.

### Up next

`Play Up Next` (a checkbox preference, on by default) makes plain `Play` do this; the
`Play with Up Next` action (`ctrl+shift+u`) does it regardless, and `YT_X_UP_NEXT=false`
overrides the preference for one run. The list itself asks the same watch-next call for the
related videos, puts the picked one first and writes the lot as an `.m3u` under
`$XDG_CACHE_HOME/yt-x/up-next/<video id>.m3u`, then starts the player on that file instead of a
URL. mpv and vlc both advance through a playlist by themselves and exit at the end, so the
feature costs one write and no second process. A written file:
`21` entries, `#EXTINF:204,Rick Astley - Together Forever (Official Video) [4K Remaster]`,
one URL per line.

The list is finite on purpose: twenty related rows and then silence. Extending it while the
player runs would need its IPC socket and a process that outlives the launcher window, which is
what this extension refuses to leave behind.

## Comments

`Comments` (`ctrl+shift+m`) opens the section as two panes: one row per thread on the left, the
full comment on the right, and under it the thread with each reply's author, likes and text.
Rows arrive 25 at a time; the replies of a thread are one more call, made when that thread's
pane is opened, so a long list costs nothing until it is read.

The data is not in the rendered comment: a thread only names it
(`commentThreadRenderer.commentViewModel.commentViewModel.commentKey`) and
`frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload` holds the text,
the author, `publishedTime`, `likeCountNotliked` and `replyCount`. A reply is the same entity
under `commentViewModel`, one level shallower, so the parser unwraps when the extra level is
there.

Measured on `dQw4w9WgXcQ`, guest, no cookies:

| Call | Answer |
| --- | --- |
| comments token | the watch-next reply's `itemSectionRenderer[sectionIdentifier=comment-item-section]` carries a 78-character token; the comments are nowhere else in that reply |
| `next` with that token | `reloadContinuationItemsCommand.continuationItems`: a header, 20 `commentThreadRenderer`s and one more token |
| thread | `@bdr8823`, `71K` likes, `688` replies, `7 years ago`, text `My algebra teacher said that this was a link to the test answers` |
| replies | `replies.commentRepliesRenderer.contents[0]` token → 10 `commentViewModel`s and a "Show more replies" button whose token sits under `button.buttonRenderer.command.continuationCommand` |

The UI fills one page to 25 threads by following the continuation once, and keeps the rest of
that page buffered for the next load. Replies stop at the first page (10 in the measured
thread) because a 688-reply thread is 68 more calls; the pane says how many the thread holds and
the row opens the comment on YouTube for the rest.

## Search history and recall

`!1` is the newest entry: `_get_search_history_entry` reads line `total - n + 1`. The write
path removes an exact duplicate, keeps the last 99 lines and appends, so the file holds 100.
`CONFIG_ENABLE_SEARCH_HISTORY=false` skips the write.

Deliberate difference: yt-x records one search when you press enter; a launcher searches while
you type. Each debounced term is written, and the growing prefixes of one search replace each
other (`drum`, `drum and`, `drum and bass` → one line). Recall, dedupe and the cap are the
script's.

## Files and shapes

yt-x 0.8.7 reads only `my/{recents,videos,subscriptions,playlists,cmds}.json`; the flat files
from older versions are ignored. On this machine the current directory is empty and all data
is in the legacy files, so reading only the current paths would show an empty library.

The extension reads the current file and falls back to its legacy counterpart **only when the
current file is absent**. An existing-but-empty current file wins, so "watched nothing since
the upgrade" is distinguishable from "never used the old yt-x". Legacy files are never
written.

Shapes measured from the real files:

- `saved-videos.json`, `recent.json`, `subscriptions.json`: `{"entries":[…]}`; entries carry
  `id`, `title`, `url`, `duration`, `channel`, `thumbnails`; the channel file uses
  `title`/`channel` and `channel_url`; legacy thumbnails start with `//` and need `https:`.
- `custom-playlists.json`: a bare array of `{id,name,url}`; a saved search playlist is a
  `results?search_query=…` URL.
- `my/cmds.json`: an array of `{name,url,"yt-dlp-opts"}` with a space-separated option string.

Writes go through `<file>.tmp` and `rename`, because yt-x may read the same file at any moment.
`my/recents.json` keeps the last `CONFIG_NO_OF_RECENT` entries, newest last; the list view
reverses it. Unsaving removes the id from both the current and the legacy file.

## Cut from the CLI, and why

| yt-x | Here | Why |
| --- | --- | --- |
| fzf/gum menus, previews, themes, languages, extension plugins (`-x`), update check | none | the launcher is the menu; the terminal UI is behind `Open yt-x` |
| `Trending` | absent | yt-dlp errors on it: the URL redirects to the home page |
| `Subscribe To Channel` (media and channel menus) | absent | yt-x answers `TXT_MENU_MEDIA_ACTIONS_SUBSCRIBE_UNSUPPORTED` / asks to import subscriptions first; there is no working action to port |
| `Shell` | absent | it exposes the current listing's state variables in a subshell; a launcher has no such state to hand over |
| `Toggle Enumerate Downloads` | read from config only | the CLI flips the variable for the life of one session; there is no session here |
| `CONFIG_DISOWN_PLAYER` | always detached | the worker exits with the window; the media must not |
| Playlist name prompt | the listing title | the prompt is prefilled with that title, so the folder is the same unless the user edited it |
| Mix playback writes `<cache>/generated-playlists/<sha256>.m3u8` | the mix URL is played directly | the player resolves the radio playlist itself; the `.m3u8` avoided a re-resolve, not a capability |
| `Previous` page | the list scrolls and the filter keeps the loaded rows | a launcher list has no page stack worth rebuilding |
| Search prompt | typing in the bar | same filters, same recall, no prompt |

## Fixes with their measurement

| Fix | Measurement |
| --- | --- |
| Single-video downloads stopped passing `CONFIG_YT_DLP_OPTS` | yt-x's `__download_yt_dlp` forwards only the arguments it is given; argv assertion was updated |
| Listings append `--extractor-args youtubetab:approximate_date` | present in `_fetch_media`; every probe above runs with it |
| Search uses `results?search_query=…&sp=…` rather than `ytsearch` | filters have no `ytsearch` equivalent; the probe returns 30 rows for a filtered term |
| Subscriptions sync does not require `CONFIG_BROWSER` | this machine has `CONFIG_BROWSER=""` and still lists feeds through yt-dlp's own cookies |
| Sync asks for confirmation before overwriting `my/subscriptions.json` | `ui_confirm "$TXT_MENU_MISC_SYNC_SUBS_CONFIRM"` in `_fetch_yt_subs` |
| Channel search kept as `channelUrl/search?query=…` | `query=drum` returns 3 rows on a channel where `query=live` returns 0 |

## Verification

- `npm run lint`, `npm run check`, `npm test` (41 checks), `npm run build` — all pass.
- `test/yt-x.test.ts` covers shell splitting, config parsing/precedence/clamping, `$EDITOR`
  resolution, XDG paths, filter ids, `!n` recall, search URL, listing argv and page numbers,
  the real search fixture, play/download/playlist-download argv including the archive hash,
  state parsing (legacy field names, `//` thumbnails), library reads/writes, search history
  prefix replacement and cap, custom commands, the detail pane's view/live/date fields, the real
  channel fixture's avatar/subscribers/description, and the corrupt-file report.
- Real-service probe with the extension's own functions against the live service and this
  machine's state: search pages 1–2 (30 + 30, disjoint), subscriptions feed (30), channel
  `/videos` (26), channel search (3 and 0), channel URL fallback, the channel header (Lofi Girl,
  15.8M subscribers, description, 9 thumbnails), playlists feed (30),
  playlist entries (30), legacy library (10 / 1 / 1 / 1), and writes plus forget inside a
  temporary config copy.
- The comments path was run against the live service with the extension's own functions:
  20 threads and their continuation, and the first thread's 10 replies plus a "show more" token.
- `Play with Up Next` was run with `YT_X_PLAYER=true` against the live service: the related
  rows came back and the `.m3u` was written to the cache with 21 entries, then deleted.
- The related column was read from the live service: a guest reply for `dQw4w9WgXcQ` returned
  20 video lockups, and `test/fixtures/related.json` holds three of them (title, channel,
  `3:24`/`4:10`/`7:46` badges, thumbnail sizes). The signed reply (`SID` and `SAPISID` from the
  Zen database, `SAPISIDHASH` sent) returned 19 video rows plus one playlist lockup, which was
  dropped.
- Installed with `npm run build`; `vicinae cmd launch '@black/yt-x:browse'` logs
  `Loaded extension yt-x:browse` and `Started extension yt-x:browse` with no error after.

## Not verified

- The launcher UI was not seen by the agent: the screen capture available in this session does
  not include the launcher surface. Loading and state reading are confirmed, the render payload
  produced no `parseRenderPayload` warning after the detail pane was added, but the two panes
  themselves were not seen. The owner opened `Related Videos` from a video's action panel and
  saw the rows render.
- Play, Listen, Download, Mix, the terminal entry and the forms were not pressed. Their argv
  and writes are asserted in tests, and the listings were run against the live service, but no
  `mpv` window or downloaded file was produced from the UI.
- mpv is assumed to resolve YouTube URLs through its own yt-dlp hook, as it does for yt-x; that
  was not exercised here.
- The `.m3u8` mix cache difference is read from yt-x's source; the alternative playback path was
  not compared side by side.
