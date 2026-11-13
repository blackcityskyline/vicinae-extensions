# Brotab

Open, focus and close the browser tabs [brotab](https://github.com/balta2ar/brotab)
knows about.

One command, `List Open Tabs`: every tab brotab reports, with actions to activate
it (which also closes the launcher), close it, copy its URL or refresh the list.

Set **Brotab Path** when `brotab` is not on `PATH`. The preference defaults to
`brotab` itself.

Forked from `@brpaz/brotab`, the Raycast store extension, because the store copy
spawned `brotab -h` only to check that brotab exists and then spawned `brotab list`
after it, doubling the wait for a list that Python has to start twice to produce.
This version runs `brotab list` once and treats its failure as the check.
`docs/audits/brotab.md` in the parent repository has the measurements.
