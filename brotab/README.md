# Brotab

Open, focus, close and screenshot the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about — and the browser's history, bookmarks, recently closed tabs and notes
kept per page.

## Commands

- **List Open Tabs** — every tab brotab reports, unloaded ones marked `U`. Two
  views: rows only, or rows beside a screenshot of the selected tab.
  `ctrl+shift+v` switches and the choice survives a relaunch.
- **History** — visits newest first, searched by title or URL in SQLite.
- **Bookmarks** — with their folder, searched by title, URL or folder.
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

Open tabs come from brotab's mediator over its HTTP interface (`/list_tabs`,
`/activate_tab`, `/close_tabs`), which is what the `brotab` CLI talks to as well.

History, bookmarks, closed tabs and notes come from the companion `brotab-ng` CLI
(one JSON object per call), which reads `places.sqlite`, the session store and its
own notes database. Writes go through the add-on, because the browser holds
`places.sqlite` and `cookies.sqlite` exclusively: `history rm`,
`history clear --cookies --cache` and screenshots are mediator routes the patched
add-on answers. Reading works without that add-on.

The screenshot pane serves the PNG from loopback: Vicinae's markdown renderer loads
images over HTTP only, not `file://` or `data:` (measured on 0.30.0). The URL
carries an opaque token and the server closes with the pane.

The mediator's `/close_tabs` and `/activate_tab` call `int()` on the tab, so only
the number goes over the wire; a non-numeric id shuts the mediator down.

## The brotab-ng dependency

The one preference is **Brotab NG Binary**. Empty, the extension looks for
`brotab-ng` on `PATH`, then in `~/.local/bin`, `/usr/local/bin` and `/usr/bin`.
`brotab-ng` needs Node 22.6 or newer; its own README covers the install, including
the add-on.

Without `brotab-ng` the open-tab list still works; the other five commands say
which binary was not found.
