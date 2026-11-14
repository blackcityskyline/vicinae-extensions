# brotab — store copy against a fork

Upstream: the Raycast store extension `store.vicinae.brotab` (`@brpaz/brotab`,
author `brpaz`, `tabs-list.js`, 118 KB minified, `execa ^9.6.0`).
There is no public source repository: `github.com/brpaz/raycast-brotab` returns
404, and the store copy ships no source map. Everything below was read out of the
bundle `~/.local/share/vicinae/extensions/store.vicinae.brotab/tabs-list.js`.

Reported symptom: the tab list takes 5–10 s to appear.

## What the copy does

One command, `tabs-list`, view mode, one preference, `brotabPath` (required,
`/bin/brotab` here).

```js
var cg = getPreferenceValues(), cr = cg.brotabPath || "bt";
const Ye = execa; // v9, preferLocal: true

async function kl() { try { await Ye(cr, ["-h"]) } catch { return false } return true }
async function Zn() {
  const { stdout } = await Ye(cr, ["list"]);
  // one tab per line, `id \t title \t url`, lines with fewer than 3 fields dropped
  // id keeps the whole first field: `a.1.17`
}
```

Two `useEffect`s: the first awaits `kl()` into a state variable, the second runs
only once that state is `true` and then awaits `Zn()`. The list is rendered with
`isLoading` while either is in flight; there is no error state, so a failing
`list` shows an empty list.

Actions: Activate (`["activate", id, "--focused"]` + `closeMainWindow`), Close
(`["close", id]`, `ctrl+x`), Copy URL (`ctrl+c`), Refresh (`ctrl+r`).

## Measured

`brotab` here is `/usr/bin/brotab`, a Python 3.14 entry script for `brotab 1.5.0`;
the mediator (`bt_mediator`) was running with 12 tabs from Zen.

| command | five runs |
| --- | --- |
| `brotab list` | 348, 313, 283, 310, 365 ms |
| `brotab -h` | 317, 318, 322 ms |

`python3 -c pass` is 37 ms and `brotab.api`'s own imports are 115 ms, so almost all
of one call is interpreter start plus `brotab.api` import — paid twice because of
the `-h` probe.

End to end, screenshots at 100 ms and OCR of the section header:

| run | first frame with `Open Tabs (12)` |
| --- | --- |
| store copy, warm worker | 1.25 s |
| store copy, after `vicinae server --replace` (cold) | 1.28 s |
| alias `btab` from the launcher | 1.20 s |

So on this machine the list arrives in 1.2 s, not 5–10 s, and the 5–10 s figure
does not reproduce: the mediator answers, there are 12 tabs, and the totals above
are stable across runs. What is reproducible is that 0.63 s of the 1.2 s is spent
in two Python spawns and that the second one cannot start until the first has
finished. Each spawn pays the interpreter start and the `brotab.api` import from
disk, so the same waterfall costs several seconds on a cold page cache (first
command after boot) or on a loaded machine — which is the shape the report
describes.

Also measured, but not the cause: the worker is unloaded after every window close
(`Unloaded extension … ran for 0.166s`), so each launch pays the node worker start
and the 118 KB bundle import; that is the remaining ~0.6 s and is not brotab's.

## The fork, first pass: drop the probe

`brotab/` in this repository. Kept: one command, the three actions, the same
`id \t title \t url` parsing, the same ids passed to brotab. Cut and fixed, each
because it was measured:

| change | why |
| --- | --- |
| no `-h` probe; `list` is the check | 317 ms and one serialised render pass for a command whose failure already means "not installed" |
| `node:child_process.execFile` instead of `execa` | drops a dependency; `preferLocal` PATH resolution and the bundled `npm-run-path`/`is-stream` code go with it |
| one state machine instead of two effects | the list request no longer waits for a separate health-check render |

Same capture method, screenshots at 100 ms, OCR of the first text the list paints:

| run | first painted tab |
| --- | --- |
| fork launched directly | 0.98 s |
| alias `btab` from the launcher | 0.81 s |
| store copy, same two paths | 1.28 s / 1.20 s |

That is the `brotab -h` spawn gone — 0.32 s of the 1.2 s, which is what the
measurement predicted, no more. The rest is the node worker start, the bundle
import and the one Python spawn.

## The fork, second pass: no Python at all

`brotab` is a client for a process the browser spawns: the mediator
(`bt_mediator`, a native-messaging host) serves plain HTTP on loopback, one port
per browser from 4625 up to 4635, and `brotab list` is a `GET /list_tabs`. Measured
directly with `curl` on 4625: answers in milliseconds, same `window.tab \t title
\t url` lines, prefix letter `a.` added by the client per port order.

So the extension now fetches instead of spawning:

| route | what the CLI did |
| --- | --- |
| `GET /get_pid` per port | probe, the mediator's own liveness check |
| `GET /list_tabs` | the whole of `brotab list` |
| `GET /activate_tab/<tab>?focused=1` | `brotab activate <id> --focused` |
| `GET /close_tabs/<tab>` | `brotab close <id>` |

Consequences: no `brotab` binary and no preference at all (`brotabPath` is gone,
`brotab` on `PATH` was already the default), one port scan in parallel instead of
one Python start per command, and the ids keep their browser letter so an action
goes back to the mediator that reported the tab.

| run | first painted tab |
| --- | --- |
| HTTP fork, launched directly | 0.50 s |

Remaining cost is the node worker start and the bundle import, which every
extension pays.

## The mediator bug this found

`/close_tabs/<ids>` and `/activate_tab/<tab>` call `int()` on what they are given.
The CLI passes the tab number alone (`a.1.17` → `17`); the window is implied. Sending
the full `1.17` raises `ValueError: invalid literal for int() with base 10: '1.34'`,
and the Flask error handler shuts the mediator down — the browser then does not
start another one, and `brotab list` hangs until the brotab add-on is reloaded in
the browser. Observed once here, during the first live close.

The extension now refuses to send an id whose last segment is not numeric
(`test/brotab.test.ts`, "a tab id without a numeric tab never reaches the
mediator"), so a future parsing change cannot take the mediator down with it.

The store copy was replaced: `store.vicinae.brotab` removed from
`~/.local/share/vicinae/extensions`, the `btab` alias and the `favorites` entry
moved to `@black/brotab` in `~/.config/vicinae/settings.json`. Worker log after
the swap: `Loaded extension brotab:tabs-list`, list of 12 tabs, action panel with
Activate, Copy URL, Close Tab and Refresh.

## Beyond the list: history, closed tabs, notes, previews

The open-tab list stays on the mediator's HTTP interface. The rest of what the
browser knows is not on it, so a companion project, `brotab-ng`
(`~/dev/me/brotab-ng`, its own repository and README), reads those sources and
answers one JSON object per call. The extension runs it with `execFile`, and the
wrapper imports nothing from `@vicinae/api`, so `test/brotab.test.ts` checks the
call, its errors and the binary lookup headless.

| command | source | measured before the extension was written |
| --- | --- | --- |
| tabs, unloaded state, page text | mediator: `/list_tabs`, `/query_tabs`, `/get_text` | 13 tabs, 12 of them reported discarded |
| history | `places.sqlite`; a copy of db+wal+shm into tmpfs, then `node:sqlite` | 12 457 visits over 9 370 pages; copy 26 ms for 13 MB, query 1.3 ms |
| closed tabs | `sessionstore-backups/recovery.jsonlz4`, a `mozLz40` header around one raw LZ4 block | 25 entries per window |
| notes | `~/.local/share/brotab-ng/notes.sqlite` | this project's own table |

The mediator's `/get_text` runs the add-on's content script in **every** loaded
tab and answers all of them in one body, which is why one preview is a CLI call
rather than one HTTP route. Unloaded tabs have no document, so Preview Page is not
offered for them.

CLI cost here, after `node -e 1` at 46 ms:

| call | five runs |
| --- | --- |
| `brotab-ng --help` | 163 ms |
| `brotab-ng history github --limit 3` | 193 ms |
| `brotab-ng closed` | 245 ms |
| `brotab-ng snapshot <tab>` | 274 ms |

So each of the new commands costs about 0.2–0.3 s, which is the CLI's Node start
and the file it reads, not the launcher.

Live checks, all from the launcher, screenshots OCR'd:

- **List Open Tabs** — painted in 0.5 s in 2 of 3 runs and in 0.6 s in 3 of 3,
  unchanged because the list still talks to the mediator. Action panel now has
  Activate, Copy URL, Preview Page (`ctrl+shift+v`), Note (`ctrl+e`), Close Tab,
  Refresh.
- **Search History** — typed `github`: rows with the visit count and a
  `YYYY-MM-DD hh:mm` timestamp, newest visit first. The search runs in SQLite, not
  in Vicinae's filter: a local filter would only reorder the returned page.
- **Recently Closed Tabs** — the session store's 25 entries, newest first, with a
  `YYYY-MM-DD hh:mm` close time.
- **Notes** — two notes written from the CLI, listed with the first line as the
  title and the page URL beneath; edited one through the form (`ctrl+e`, type,
  `ctrl+s`) and created another through the New Note form (URL and body saved):
  the list refreshed both times and `brotab-ng notes --json` showed the new body.
  With no notes at all, `ctrl+n` does not fire — Vicinae binds a shortcut to the
  selected row's actions, and the empty view's New Note is reached from the action
  panel — but the same form and shortcut work as soon as one row exists.
- **Preview Page** — the selected Google results tab rendered its page text in a
  Detail view; Copy Page Text carries the full text, which is clipped at 10 000
  characters in the view.

One measured trap, again about the environment rather than the code: Vicinae's
server did not have `~/.local/bin` on its `PATH`, so the first live preview showed
`brotab-ng was not found at "brotab-ng"` while the shell had it. With the
preference empty the extension now checks `~/.local/bin`, `/usr/local/bin` and
`/usr/bin` before falling back to the bare name; the retest rendered the page. The
one preference, **Brotab NG Binary**, overrides that lookup.

## Screenshots, deletion and pages of rows

The page-text preview above is gone. Three things are browser APIs rather than
files, and the browser keeps `places.sqlite` and `cookies.sqlite` under an
exclusive lock, so no outside process can write them:

| command | route added to the mediator | add-on call |
| --- | --- | --- |
| screenshot of a tab | `/screenshot/<tab>` | select the tab, wait 400 ms, `captureVisibleTab`, put the previous tab back |
| forget one URL | `/delete_history_url/<base64url>` | `history.deleteUrl` |
| forget a period | `/delete_history_range/<start>/<end>` | `history.deleteRange` |
| cookies and cache | `/clear_browsing_data?since=&cookies=&cache=` | `browsingData.remove` |

`brotab-ng` grew both sides: `addon/` is the stock 1.4.0 add-on with the four
handlers and the `history` and `browsingData` permissions, and
`mediator/brotab_ng_mediator.py` is the native-messaging host that adds the routes
to `MediatorHttpServer` and then lets `mediator_main` run as usual. Writing to
`places.sqlite` from outside was tried and fails with `database is locked` even
with `busy_timeout`.

Measured after a browser restart, all against the real profile:

| what | result |
| --- | --- |
| `brotab-ng screenshot b.1.2`, a discarded tab | 1.1 s, 669×457 PNG |
| `brotab-ng history rm <test url>` | the entry is gone from the next query |
| `brotab-ng history clear --period 1h --cache` | test visits gone, cache 1.1 G → 962 M |
| `brotab-ng history clear --cookies` | deliberately not run: it signs the profile out of every site |

Two traps found on the way, both fixed in the wrapper and the add-on:

- A route that raises `ValueError` or `TimeoutError` reaches brotab's error
  handler, which shuts the mediator down for good. The four new routes catch
  everything and answer `{"error": "…"}`.
- Stock 1.4.0 attaches its port listeners once, at load, so after the mediator
  dies the reconnect gets a port with no handlers and every command hangs. The
  patched add-on attaches them in `reconnect()`. Verified by killing the
  mediator: the browser started a new one on a free port and the tab list came
  back without a browser restart.

On the extension side the lists page through `--limit`/`--offset` with a
`hasMore` flag (`src/lib/paging.ts`, `PAGE_SIZE = 100`). Proved by building with
`PAGE_SIZE = 3`: eight rows appeared, i.e. three pages were fetched as the list
filled the viewport, then the constant went back to 100.

The screenshot pane is a `List.Item.Detail`, not a pushed page: rows on the left,
the image on the right, and `ctrl+shift+v` toggles it. That is also where the
renderer's HTTP-only image loading matters — `![](...)` with a `file://` URI, a
bare path, or a `data:` URI renders nothing at all on 0.30.0, while the same bytes
over `http://127.0.0.1` draw. Hence the loopback server; it binds port 0, serves
only tokens it handed out and closes when the pane does.

Screenshots are taken on demand, not per row: `captureVisibleTab` selects the tab
first, so a list that previewed itself would shuffle the browser's tabs.
