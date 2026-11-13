# Brotab

Open, focus and close the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about.

One command, `List Open Tabs`: every tab brotab reports, with actions to activate
it (which also closes the launcher), close it, copy its URL or refresh the list.
No preferences: the ports brotab's mediator uses are its own fixed range.

This talks to the mediator over its HTTP interface — `GET /list_tabs`,
`/activate_tab`, `/close_tabs` — instead of spawning the `brotab` CLI, because the
CLI is a Python program that pays an interpreter start and the `brotab.api` import
before it can send the same request. No `brotab` binary is needed, only a running
browser with the brotab extension.

Forked from `@brpaz/brotab`, the Raycast store extension, which probed with
`brotab -h` and only then ran `brotab list`. `docs/audits/brotab.md` in the parent
repository has the measurements, including the mediator bug that makes a
non-numeric tab id shut it down.
