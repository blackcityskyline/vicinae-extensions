# Brotab

Open, focus, close and preview the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about — and search the browser's own history, its recently closed tabs and
notes kept per page.

## Commands

- **List Open Tabs** — every tab brotab reports, the ones unloaded from memory
  marked `U`. Actions: Activate (which also closes the launcher), Preview Page,
  Note, Copy URL, Close Tab, Refresh.
- **Search History** — the browser's history by title or URL, newest visit first,
  with the visit count. Actions: Open in Browser, Copy URL, Note.
- **Recently Closed Tabs** — what the session store still remembers, newest first.
  Actions: Open in Browser, Copy URL, Note, Refresh.
- **Notes** — one note per page URL, written from any of the three lists or
  here. Actions: Edit Note, Open in Browser, Copy Note, Copy URL, Remove Note.

Every action has a shortcut: `ctrl+o` open, `ctrl+e` note or edit, `ctrl+shift+v`
preview, `ctrl+c` copy, `ctrl+x` close or remove, `ctrl+r` refresh, `ctrl+n` a new
note.

## Where the data comes from

The open-tab list talks to brotab's mediator directly, over the HTTP interface the
browser already runs (`GET /list_tabs`, `/query_tabs`, `/activate_tab`,
`/close_tabs`). Reading it that way is what makes the list quick: the `brotab` CLI
is a Python program that pays an interpreter start and the `brotab.api` import
before it can send the same request.

History, closed tabs, notes and page previews are not on that interface — they
live in the browser profile, its session store and a notes database — so those
three commands go through the companion `brotab-ng` CLI, one JSON object per call.
It is a separate project at `~/dev/me/brotab-ng`.

The mediator bug worth knowing: `/close_tabs` and `/activate_tab` call `int()` on
the tab, and a non-numeric id shuts the mediator down for good. Only the tab
number goes over the wire; `docs/audits/brotab.md` in the parent repository has the
measurement.

## The brotab-ng dependency

The one preference is **Brotab NG Binary**. Left empty, the extension looks for
`brotab-ng` on `PATH`, then in `~/.local/bin`, `/usr/local/bin` and `/usr/bin`.
Vicinae's server does not always inherit a session's `PATH`, which is why the
fallback exists.

`brotab-ng` needs Node 22.6 or newer; its own README covers the install.

Without `brotab-ng` the open-tab list still works and the three other commands
say which binary was not found.

Forked from `@brpaz/brotab`, the Raycast store extension, which probed with
`brotab -h` and only then ran `brotab list`. This asks the mediator instead.
