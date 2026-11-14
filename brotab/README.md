# Brotab

Open, focus, close and screenshot the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about — and the browser's own history, bookmarks, recently closed tabs and
notes kept per page.

## Commands

- **List Open Tabs** — every tab brotab reports, the ones unloaded from memory
  marked `U`. The screenshot is a second pane: `ctrl+shift+v` opens it beside the
  rows and the same key closes it, while the arrow keys go back to the list.
- **History** — the browser's history as a list, newest visit first, searched by
  title or URL in SQLite. Opens with rows, not with an empty prompt.
- **Bookmarks** — the browser's bookmarks with their folder, searched by title,
  URL or folder.
- **Clear History** — a period (last hour, 24 hours, 7 days, 4 weeks or
  everything) and, optionally, the cookies and cache from the same period.
  Destructive, so it asks once.
- **Recently Closed Tabs** — what the session store still remembers, newest first.
- **Notes** — one note per page URL, written from any of the lists or here. A
  search with no match offers to start a note with that text: a URL goes into the
  URL field, anything else into the body.

History, bookmarks, closed tabs and notes load one page of 100 rows at a time and
fetch the next when the list reaches its end, so nothing reads 12 000 visits to
show the first screen.

| shortcut | action |
| --- | --- |
| `ctrl+o` | open in browser, or activate the tab |
| `ctrl+e` | the note for a page, or edit the note |
| `ctrl+c` | copy URL or note |
| `ctrl+x` | close the tab, remove the history entry, remove the note |
| `ctrl+r` | refresh |
| `ctrl+n` | a new note |
| `ctrl+shift+v` | the screenshot pane, on the open-tab list |
| `ctrl+shift+x` | delete a period of history |

## Where the data comes from

The open-tab list talks to brotab's mediator directly, over the HTTP interface the
browser already runs (`GET /list_tabs`, `/query_tabs`, `/activate_tab`,
`/close_tabs`). Reading it that way is what makes the list quick: the `brotab` CLI
is a Python program that pays an interpreter start and the `brotab.api` import
before it can send the same request.

The rest is not on that interface. The companion `brotab-ng` CLI
(`~/dev/me/brotab-ng`, its own repository) reads `places.sqlite` for history and
bookmarks, the session store for closed tabs and its own SQLite file for notes, and
answers one JSON object per call. Writes to the browser go through the add-on,
because the browser holds `places.sqlite` and `cookies.sqlite` under an exclusive
lock: `history rm`, `history clear --cookies --cache` and the screenshots are
mediator routes the patched add-on answers — `captureVisibleTab`,
`history.deleteUrl`, `history.deleteRange`, `browsingData.remove`.

That add-on is `brotab-ng`'s `addon/` (1.5.1) with the native-messaging host
pointed at its `mediator/brotab_ng_mediator.py`; the stock 1.4.0 add-on answers
those routes with an error. Reading still works without it.

Vicinae's markdown renderer loads images over HTTP only — a `file://` URI or a bare
path renders as nothing (measured on 0.30.0) — so the screenshot pane serves the
PNG the CLI wrote from a loopback port for as long as it is open
(`src/lib/image-server.ts`). The URL carries an opaque token; no request path ever
reaches the filesystem.

The mediator bug worth knowing: `/close_tabs` and `/activate_tab` call `int()` on
the tab, and a non-numeric id shuts the mediator down for good. Only the tab
number goes over the wire; `docs/audits/brotab.md` in the parent repository has the
measurement.

## The brotab-ng dependency

The one preference is **Brotab NG Binary**. Left empty, the extension looks for
`brotab-ng` on `PATH`, then in `~/.local/bin`, `/usr/local/bin` and `/usr/bin`.
Vicinae's server does not always inherit a session's `PATH`, which is why the
fallback exists.

`brotab-ng` needs Node 22.6 or newer; its own README covers the install, including
the add-on.

Without `brotab-ng` the open-tab list still works and the other five commands say
which binary was not found.

Forked from `@brpaz/brotab`, the Raycast store extension, which probed with
`brotab -h` and only then ran `brotab list`. This asks the mediator instead.
