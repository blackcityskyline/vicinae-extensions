# Brotab

Open, focus, close and screenshot the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about — and the browser's history, bookmarks, recently closed tabs and notes
kept per page.

## Commands

- **List Open Tabs** — every tab brotab reports, unloaded ones marked `U`. Two
  views: rows only, or rows beside a screenshot of the selected tab.
  `ctrl+shift+v` switches and the choice survives a relaunch.
- **History** — visits newest first, searched by title or URL in SQLite.
- **Bookmarks** — with their folder, searched by title or URL.
- **Clear History** — a period (last hour, 24 hours, 7 days, 4 weeks or
  everything) and, optionally, the cookies and cache from it. Asks once.
- **Recently Closed Tabs** — what the session store still remembers, newest first.
- **Notes** — one note per page URL. A search with no match offers to start a note
  with that text: a URL goes into the URL field, anything else into the body.

History, bookmarks, closed tabs and notes load 100 rows at a time and fetch the
next page when the list reaches its end.

| shortcut | action |
| --- | --- |
| `ctrl+o` | open in browser, or activate the tab |
| `ctrl+e` | the note for a page, or edit the note |
| `ctrl+c` | copy URL or note |
| `ctrl+x` | close the tab, remove the history entry, remove the note |
| `ctrl+r` | refresh |
| `ctrl+n` | a new note |
| `ctrl+shift+v` | rows only, or rows and the screenshot |
| `ctrl+shift+x` | delete a period of history |

## Where the data comes from

Everything the browser keeps in files is read in this process, with
`node:sqlite` and the session store's own LZ4 format. Nothing is spawned:

| what | source | measured |
| --- | --- | --- |
| open tabs, unloaded state | the mediator, HTTP on loopback ports 4625–4635 | one `/list_tabs` and one `/query_tabs {"discarded":true}` |
| history, bookmarks | a temporary copy of `places.sqlite` | 14–21 ms for the first 100 visits, 17–25 ms searched, 12–15 ms for bookmarks |
| closed tabs | `sessionstore-backups/recovery.jsonlz4` | 29–67 ms for 25 entries, half of it the LZ4 decode |
| notes | `~/.local/share/brotab-ng/notes.sqlite` | under 1 ms |
| screenshots, history deletion, cookies and cache | the add-on, through the mediator | about 1 s for a screenshot of a discarded tab |

The copy is what makes reading safe while the browser holds `places.sqlite` open
in WAL mode: SQLite needs the shared-memory file, so a read-only handle on the
original fails with `database is locked`, and copying the database plus its two
side files takes 9–14 ms for 10 MB on tmpfs.

A history page walks `moz_places.last_visit_date`, the browser's own indexed copy
of the newest visit, instead of grouping every visit; the `×N` count still comes
from `moz_historyvisits`, because `visit_count` skips reload-type visits and
would change the number shown.

Writes are not allowed from outside: the browser keeps `places.sqlite` and
`cookies.sqlite` exclusively, and screenshots, `history.deleteRange` and
`browsingData.remove` are browser APIs anyway. Those three go to the add-on
through the mediator. Deleting a history entry sends the URL as padded base64url;
the mediator calls `int()` on a tab id, so a non-numeric id is rejected here
before it can shut the mediator down.

The screenshot pane serves the PNG from loopback: Vicinae's markdown renderer
loads images over HTTP only, not `file://` or `data:` (measured on 0.30.0). The
URL carries an opaque token, the file is written under
`~/.cache/brotab-ng/screenshots`, and the server closes with the pane.

## What it needs

Node 22.6 or newer for `node:sqlite`; Vicinae runs extensions on its own Node,
so there is nothing to install for it.

The browser side is the brotab add-on with the extra routes this extension uses:
`/screenshot`, `/delete_history_url`, `/delete_history_range` and
`/clear_browsing_data`. They come from `brotab-ng`'s add-on and mediator; the
upstream Python `brotab` CLI is not used and does not need to be installed.
Without the mediator, history, bookmarks, closed tabs and notes still work: they
never touch it. The tab list and the three write paths say it is not running.
