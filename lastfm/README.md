# Last.fm

Charts, your library and artist pages from Last.fm.

| Command | Does |
| --- | --- |
| Browse Last.fm | Global Charts, This Week, Your Library, Find Artist |
| Now Playing | the currently playing track |
| Top & Recent Songs, Top Songs, Recent Songs | your lists |
| Top Artists, Top Albums | your lists |

Rows can be opened on YouTube Music or Monochrome, and carry `keywords` so a
track is found by artist or album.

## Setup

Free API credentials from [last.fm/api/account/create](https://www.last.fm/api/account/create):
**API Key**, **API Secret** and **Username**; **Limit** and **Period** set the
list length and window. Key and username may stay empty — a required preference
without a default makes Vicinae refuse to start the command and log nothing.

Deployed from `raycast/extensions/extensions/lastfm`; the `menubar` command is
cut.
