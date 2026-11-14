# brotab — store copy against a fork

Upstream: the Raycast store extension `store.vicinae.brotab` (`@brpaz/brotab`,
author `brpaz`, `tabs-list.js`, 118 KB minified, `execa ^9.6.0`). No source
repository: `github.com/brpaz/raycast-brotab` is 404 and the copy ships no source
map. Read from `~/.local/share/vicinae/extensions/store.vicinae.brotab/tabs-list.js`.

Symptom: the tab list takes 5–10 s to appear.

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

Two `useEffect`s: the first awaits `kl()` into state, the second runs only once
that state is `true` and awaits `Zn()`. `isLoading` covers both; there is no error
state, so a failing `list` shows an empty list.

Actions: Activate (`["activate", id, "--focused"]` + `closeMainWindow`), Close
(`["close", id]`, `ctrl+x`), Copy URL (`ctrl+c`), Refresh (`ctrl+r`).

## Measured

`brotab` is `/usr/bin/brotab`, a Python 3.14 entry script for `brotab 1.5.0`; the
mediator (`bt_mediator`) served 12 Zen tabs.

| command | five runs |
| --- | --- |
| `brotab list` | 348, 313, 283, 310, 365 ms |
| `brotab -h` | 317, 318, 322 ms |

`python3 -c pass` is 37 ms and `brotab.api`'s imports are 115 ms, so almost all of
one call is interpreter start plus the import — paid twice because of the `-h`
probe.

End to end, screenshots at 100 ms, OCR of the section header:

| run | first frame with `Open Tabs (12)` |
| --- | --- |
| store copy, warm worker | 1.25 s |
| store copy, cold worker | 1.28 s |
| alias `btab` from the launcher | 1.20 s |

The 5–10 s figure does not reproduce; 1.2 s is stable here. 0.63 s of it is the
two serialised Python spawns, which is what stretches to seconds on a cold page
cache or a loaded machine. The remaining ~0.6 s is the worker start and the
118 KB bundle import, which every extension pays.

## The fork, first pass: drop the probe

| change | why |
| --- | --- |
| no `-h` probe; `list` is the check | 317 ms and a serialised render pass for a command whose failure already means "not installed" |
| `node:child_process.execFile` instead of `execa` | drops a dependency and its `preferLocal` path resolution |
| one state machine instead of two effects | the list request no longer waits for a health-check render |

| run | first painted tab |
| --- | --- |
| fork launched directly | 0.98 s |
| alias `btab` from the launcher | 0.81 s |
| store copy, same two paths | 1.28 s / 1.20 s |

## The fork, second pass: no Python at all

The mediator (`bt_mediator`, a native-messaging host) serves plain HTTP on
loopback, one port per browser from 4625 to 4635; `brotab list` is a
`GET /list_tabs`. `curl` on 4625 answers in milliseconds with the same
`window.tab \t title \t url` lines, prefix letter `a.` added per port order.

| route | what the CLI did |
| --- | --- |
| `GET /get_pid` per port | probe, the mediator's own liveness check |
| `GET /list_tabs` | the whole of `brotab list` |
| `GET /activate_tab/<tab>?focused=1` | `brotab activate <id> --focused` |
| `GET /close_tabs/<tab>` | `brotab close <id>` |

No `brotab` binary and no preference at all, one port scan in parallel instead of
one Python start per command, and ids keep their browser letter so an action goes
back to the mediator that reported the tab.

| run | first painted tab |
| --- | --- |
| HTTP fork, launched directly | 0.50 s |

## Mediator trap

`/close_tabs/<ids>` and `/activate_tab/<tab>` call `int()` on their argument. The
CLI sends the tab number alone (`a.1.17` → `17`). Sending `1.17` raises
`ValueError: invalid literal for int() with base 10: '1.34'`, and the Flask error
handler shuts the mediator down for good; `brotab list` then hangs until the add-on
is reloaded. The extension refuses an id whose last segment is not numeric
(`test/brotab.test.ts`, "a tab id without a numeric tab never reaches the
mediator").

## History, closed tabs, notes, previews

The open-tab list stays on the mediator's HTTP interface. The rest is read by a
companion CLI, `brotab-ng` (`~/dev/me/brotab-ng`), one JSON object per call, run
with `execFile`.

| command | source | measured |
| --- | --- | --- |
| tabs, unloaded state | mediator `/list_tabs` | 13 tabs, 12 discarded |
| history | `places.sqlite`, db+wal+shm copied to tmpfs, then `node:sqlite` | 12 457 visits over 9 370 pages; copy 26 ms for 13 MB, query 1.3 ms |
| closed tabs | `sessionstore-backups/recovery.jsonlz4`, a `mozLz40` header around one raw LZ4 block | 25 entries per window |
| notes | `~/.local/share/brotab-ng/notes.sqlite` | own table |

CLI cost, after `node -e 1` at 46 ms:

| call | five runs |
| --- | --- |
| `brotab-ng --help` | 163 ms |
| `brotab-ng history github --limit 3` | 193 ms |
| `brotab-ng closed` | 245 ms |

0.2–0.3 s per new command is the CLI's Node start and the file it reads.

Vicinae's server does not inherit the session `PATH`, so an empty preference also
checks `~/.local/bin`, `/usr/local/bin` and `/usr/bin` before the bare name. The
one preference, **Brotab NG Binary**, overrides that lookup.

## Screenshots, deletion and pages of rows

The browser keeps `places.sqlite` and `cookies.sqlite` under an exclusive lock, so
writes and captures are add-on routes:

| command | route added to the mediator | add-on call |
| --- | --- | --- |
| screenshot of a tab | `/screenshot/<tab>` | select the tab, wait 400 ms, `captureVisibleTab`, put the previous tab back |
| forget one URL | `/delete_history_url/<base64url>` | `history.deleteUrl` |
| forget a period | `/delete_history_range/<start>/<end>` | `history.deleteRange` |
| cookies and cache | `/clear_browsing_data?since=&cookies=&cache=` | `browsingData.remove` |

`brotab-ng` carries both sides: `addon/` is the stock 1.4.0 add-on with the four
handlers and the `history` and `browsingData` permissions, and
`mediator/brotab_ng_mediator.py` adds the routes to `MediatorHttpServer` before
`mediator_main` runs. Writing `places.sqlite` from outside fails with
`database is locked` even with `busy_timeout`.

| what | result |
| --- | --- |
| `brotab-ng screenshot b.1.2`, a discarded tab | 1.1 s, 669×457 PNG |
| `brotab-ng history rm <test url>` | gone from the next query |
| `brotab-ng history clear --period 1h --cache` | test visits gone, cache 1.1 G → 962 M |
| `brotab-ng history clear --cookies` | not run: it signs the profile out of every site |

Two wrapper and add-on rules:

- A route that raises reaches brotab's error handler, which shuts the mediator
  down for good. The four routes catch everything and answer `{"error": "…"}`.
- Stock 1.4.0 attaches its port listeners once at load, so a reconnect after the
  mediator dies gets a port with no handlers. The patched add-on attaches them in
  `reconnect()`; killing the mediator brought the tab list back on a new port
  without a browser restart.

The lists page through `--limit`/`--offset` with `hasMore`
(`src/lib/paging.ts`, `PAGE_SIZE = 100`), proved with `PAGE_SIZE = 3`: eight rows,
three pages fetched as the viewport filled.

The screenshot pane is a `List.Item.Detail`, not a pushed page: the list has two
modes, rows only or rows beside the picture, `ctrl+shift+v` switches, and the mode
is remembered in `Cache` between launches. Only the selected row carries the
detail, so the arrows keep the pane and change the image; a 250 ms pause keeps a
held key from capturing every row. Screenshots are taken on demand because
`captureVisibleTab` selects the tab first.

Vicinae's markdown renderer loads images over HTTP only: `file://`, a bare path and
`data:` render nothing on 0.30.0, while the same bytes over `http://127.0.0.1`
draw. The loopback server (`src/lib/image-server.ts`) binds port 0, serves only
tokens it handed out and closes with the pane.
