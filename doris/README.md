# doris

Search torrent trackers and stream results through TorrServer, from the
launcher, with the `doris` CLI doing the work.

| Command | Does |
| --- | --- |
| Search Torrents | every tracker doris has enabled; Enter plays the row in mpv, `ctrl+shift+d` sends it to Transmission |
| TorrServer | what the server is holding — play, pause, resume, files, remove — and the service itself: start, stop, restart, Web UI, storage |
| Trackers | switch doris's sources on and off, and open their home pages |

## Preferences

`Doris Binary` is empty by default: the extension uses `doris` on `PATH`, then
`~/.local/bin/doris`, which is where `make install` in the doris repository puts
it. Vicinae's server does not inherit a login shell's `PATH`, so `~/.local/bin`
is usually missing from it — set the path here if the resolved binary is stale.

Everything else (the TorrServer URL, the enabled trackers, the Transmission URL)
is read by doris itself from `~/.config/doris/config.toml`. Nothing is
duplicated here.

## Keys

| Where | Action | Key |
| --- | --- | --- |
| Search | play in mpv | `Enter` |
| Search | download in Transmission | `ctrl+shift+d` |
| Search | save the `.torrent` to `~/Downloads` | `ctrl+shift+s` |
| Search | copy magnet | `ctrl+shift+c` |
| Search | open the release page | `ctrl+o` |
| Search | choose the sources to search | `ctrl+t` |
| Search | refresh | `ctrl+r` |
| TorrServer | play in mpv | `Enter` |
| TorrServer | pause / resume | `ctrl+shift+p` / `ctrl+shift+r` |
| TorrServer | file list | `ctrl+shift+f` |
| TorrServer | remove from the server | `ctrl+x` |
| TorrServer | refresh | `ctrl+r` |
| TorrServer | open the Web UI | `ctrl+o` |
| TorrServer | start the service (when it is down) | `ctrl+shift+s` |
| TorrServer | restart the service | `ctrl+shift+t` |
| TorrServer | stop the service | `ctrl+shift+q` |
| TorrServer | storage: set the path and cache policy | `ctrl+shift+g` |
| Trackers | switch the selected source on / off | `Enter` or `ctrl+t` |
| Trackers | open the source's home page | `ctrl+o` |
| Trackers | refresh | `ctrl+r` |

Search and TorrServer are a list with a detail pane; Trackers is a plain list.
Search runs as you type, but only for a phrase of 3+ characters and only once
the typing settles for 0.8 s: the CLI waits on every enabled tracker, so a search
per keystroke would stack minutes of work behind the box. Typing over a running
search aborts its `doris` process instead of leaving it to finish.

The extension passes no deadline. It runs
`doris --json search --stream <phrase>`; the CLI matches the query, ranks
relevance before seed count, and decides how long a tracker may take.

`--stream` is why the window is not empty: the CLI prints one JSON array per
line, the moment a tracker answers, and the list grows with each one. The four
trackers that need no browser are rows in under half a second; rutracker's fifty
land at the end, ~38 s later, each batch ranked among itself. Waiting for all of
them is one array at the end — the launcher shows nothing for ~half a minute.

The list re-arranges with its rows: one action toggles "Sort by seeds" ↔ "Sort
by size", the other pushes "Filter sources" — a page of the trackers' checkboxes.
Applying leaves that tracker's rows out of every search; checking all of them
is the same as no filter. Both live on the row action panel.

The CLI caches each source's answer for 5 minutes in
`~/.local/share/doris/search-cache.json`. The extension runs a new `doris` per
search, so the cache is the only repeat route: measured 22.11.2026,
`doris --json search --stream "the matrix 1999"` — first run 37.7 s (no
entries on disk yet), identical second run 0.04 s, 5 batches.

The list does not filter the rows again — a Russian title is not matched by a
Latin query — so it shows every row the CLI returned, in the CLI's order.

Playing and downloading hand the row back: `doris --json play --row '<the row
as printed>'`. The CLI resolves the magnet, the `.torrent` link, the page and
the source from that one argument, so a row with no magnet (rutracker,
nnmclub) costs no second search and no index into a list that may have been
reordered since it was drawn.

## The TorrServer service

`doris` has no verb for it: `doris torrent` is list, status, pause, resume,
remove, files, watch, storage, add. What the TUI's "Enable TorrServer" switch
does is run `systemctl start torrserver.service` from its own code
(`src/app/settings.rs`), so that measured command is what the extension runs —
the unit is `/usr/lib/systemd/system/torrserver.service`.

`sudo -n`, never a prompt. Measured here: a plain `systemctl start
torrserver.service` from the session fails with `Connection timed out` — there
is no polkit agent to ask through — while `sudo -n systemctl start …` succeeds
and the port answers about three seconds later. Vicinae has no terminal, so if
sudo ever wanted a password the action says so and stops
(`sudo systemctl … torrserver.service` in a terminal) instead of waiting.

Two things that follow from that:

- After a start or restart the extension waits for `doris health` to say the
  server answers before reloading the list — `systemctl start` returns before
  the port is open, and the list would otherwise show "unreachable" over a
  server that is fine. The wait is bounded and only runs on the click.
- Stopping cuts running streams, so it asks first: `Stop TorrServer?`. In that
  dialog `Enter` cancels — Cancel holds the focus — so it is `Tab`, then
  `Enter`.

`Storage` opens a form over `doris torrent storage`:

- **Download path** and **Keep cache** are prefilled from `storage show` and
  saved with `storage set <path> [--keep-cache]`. The path is written as typed,
  so an empty field is refused instead of sent: `doris` takes it as a required
  argument and has no default to fall back on.
- **Stop Caching to Disk** (`ctrl+shift+o`) is `storage off`, and it asks
  first: TorrServer clears the save path with it (measured — `storage off` on
  this server answered `path: ""`), and anything already fetched is dropped as
  its readers leave.

## What the CLI does and does not offer

Measured against doris 0.1.0 and TorrServer MatriX.150.

- `doris --json search <query>` prints the rows. A query that found nothing
  prints `[]` and exits `1`; the trackers that failed are named on stderr. That
  is an empty result, not a failure.
- `doris --json play --row '<row>'` prints `{title, magnet, url, error}` for
  exactly that row, and `download --row` does the same for Transmission. A
  `view` command with no argument opens the form instead of searching.
- `--row` reads a row as `--json search` printed it. For a browser-backed
  source the CLI opens the session and logs in itself before it fetches the
  `.torrent` — in the TUI the search is what opened that session, and a
  one-shot command has nobody else to do it. Measured: a rutracker row that
  had never been opened answered HTTP 403 (`dl.php` wants the topic page's
  `bb_dl` cookie), so the CLI opens the topic and retries once.
- There is no `torrent play <hash>`, so a torrent the server already holds is
  played through `play --magnet magnet:?xt=urn:btih:<hash>`: TorrServer keys on
  the info hash and reuses its own entry.
- `play` has no `--title`, so a stream's entry on the server keeps whatever name
  TorrServer derived. `torrent add --title` is accepted and does not change the
  name the server reports.
- Pause is `{"action":"drop"}` and resume is `{"action":"get"}`. The server then
  says "Torrent in db" and "Torrent working"; doris's own TUI writes "Torrent
  closed" into its row locally, and its `is_paused()` looks for that word, so it
  never fires against this server. The extension shows the server's string as it
  is, and offers Pause only while it says "working".
- No doris verb writes a `.torrent` to disk: `download` hands the magnet to
  Transmission and `torrent add` hands it to TorrServer. Save `.torrent` is the
  extension fetching `download_url` itself, so it is offered only when that URL
  is absolute — rutor prints `https://rutor.info/download/…`. Rutracker prints a
  path relative to its own base (`dl.php?t=…`) that only answers inside the
  browser session doris holds, and yts/tpb print no URL at all; those rows have
  no save action rather than a broken one.
- Release page links go through `sources list`'s `home` for the same reason:
  rutracker prints `viewtopic.php?t=…`, which is resolved against its home.
- The storage verbs were extended for this: `storage set` wrote `UseDisk: true`
  and only ever *added* `--keep-cache`, so one `--keep-cache` could never be
  undone and disk caching could not be switched off at all. `set` now writes
  both keys every time (`RemoveCacheOnDrop: !keep_cache`), `storage off` exists,
  and `storage show` reports `keep_cache` next to `path` and `use_disk`.
- A settings write plus its read-back measured 3.5 s here, and the old 5 s
  ceiling refused a write that had applied; it is 15 s now.
- `download` needs the Transmission daemon (doris's `transmission_url`), and
  reports its refusal as `{id, reason}` rather than an error.
- A search is as slow as the slowest enabled source. With rutracker off the
  whole answer takes about 2 s; with it on, a search pays for a browser launch
  and a Cloudflare challenge, which is where the tens of seconds go (measured
  below). That is why the extension reads `--stream`: the wait costs rows
  arriving late, not a window with nothing in it. The extension passes no
  deadline; typing over a search aborts the process, which is the only cut it
  makes.

## Verified live

2026-11-22, doris 0.1.0 on Hyprland 0.56.2:

- `doris --json search "the matrix 1999"` returned 240 rows in 37 s with every
  source on (tpb 100, rutor 39, nnmclub 50, rutracker 50, yts 1), The Matrix
  releases first. The old 301 was rutor answering a hundred unrelated fresh
  releases: its words went into one path segment each, which rutor ORs, so
  `the` alone matched the whole front page. The query is one phrase segment
  now, which is what the site's own form sends.
- `doris --json search --stream "the matrix 1999"` printed the first batch at
  0.12 s, three more at 0.31–0.42 s, then rutracker's fifty at 36.9 s. Before
  the browser launch was moved off the dispatch path, every batch waited
  behind it and the first only arrived at 4.6 s.
- What the 37 s is: rutor, yts, tpb and nnmclub answer in 0.1–0.3 s. Rutracker
  costs a browser launch (~12 s to first navigation) and then a Cloudflare
  challenge per navigation (~14 s on the search page, another on the topic page
  for a `.torrent`). None of it is the extension's time: `doris --source rutor
  "the matrix 1999"` answers in about a second.
- `doris --json play --row '<tpb row>'` answered in 0.04 s: the magnet goes to
  TorrServer, no search.
- `doris --json play --row '<rutracker row>'` answered in 49 s — session,
  Cloudflare, 403 from `dl.php`, topic page, retry — and printed a stream URL.
- The abort path is covered by the test with a sleeping fake CLI; a typed-over
  search was not watched on screen. The incremental render is covered the same
  way: a fake CLI that sleeps between its two arrays, and the test fails if the
  first callback waits for the process to exit. The Vicinae window itself could
  not be watched here — its popup closes ~1.5 s after opening even with no
  command in it — so the streaming is verified at the CLI's stdout, not on the
  launcher's screen.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks: argv building, JSON parsing, formatting
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/doris/search'
vicinae 'vicinae://launch/@black/doris/torrents'
vicinae 'vicinae://launch/@black/doris/sources'
```

The search test uses the real CLI's answer shape, including the `[]` + exit 1
case; the CLI itself is never run by the tests.
