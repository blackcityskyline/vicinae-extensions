# Process Manager

A fork of the store's `process-manager` (author `leonkohli`), rebuilt over
`/proc` with btop as the reference for what a process row should carry.

The store copy bundles `systeminformation`, `freedesktop-icons` and `xdg-apps`
into a 328 KB minified file, reads the table through `ps`, shows
`/proc/<pid>/comm` — so eight Chromium processes all read `electron`, no way to
tell the renderer from the GPU process. Its CPU column is `ps`'s `pcpu`, a
lifetime average that never moves. Its `Kill Process` runs `pgrep -f "<name>"`
through a shell, so a name is a command line.

## What a row says

btop's columns: **Program** (title), **PID · user · Command** (subtitle),
**CPU** and **MEM** (accessories).

- **Program** — `/proc/<pid>/comm`, the kernel's short name.
- **Command** — `/proc/<pid>/cmdline`, argv joined by spaces; this tells the
  eight `electron` rows apart (`--type=renderer`, `--type=gpu-process`, …).
  The preference `Show Path` swaps it for the executable.
- **CPU** — btop's formula: `100 × Δticks/Δtotal × cores`, so one saturated
  core reads 100% from two samples, not a lifetime average. The first sample
  has no predecessor: the list takes a second one half a second later; until
  then every share is zero.
- **MEM** — RSS pages × page size, in binary units (`86.5 MiB`), btop's
  default (`proc_mem_bytes = true`).

`Enter` opens btop's detailed panel: status, elapsed, CPU, memory, I/O read and
written, parent, user, threads, nice, and the executable. The status word comes
from btop's own table (`R` Running, `S` Sleeping, `D` Waiting, `Z` Zombie, `T`
Stopped, `t` Tracing, `K` Wakekill, `P` Parked); `I` was missing from it and is
spelled Idle here.

Kernel threads (children of `kthreadd`, PID 2) are hidden unless
`Show System Processes` is on. Sorting: CPU descending, memory breaking ties —
idle rows keep a stable order. The search-bar dropdown (`CPU Usage` /
`Memory Usage`) swaps the two.

## What is not here

- **Per-application icons.** btop draws none; the fork answers *which* process
  a row is — the command line says it.
- **`ps`.** Nothing is shelled out for the table; no `ps` output to parse, no
  process per refresh.

## Keybindings

| Action | Key |
| --- | --- |
| Show details | `Enter` |
| Kill (`SIGTERM`) | `ctrl+k` |
| Force Kill (`SIGKILL`), asks first | `ctrl+shift+k` |
| Copy PID | `ctrl+shift+i` |
| Copy Path | `ctrl+shift+,` |
| Reload | `ctrl+r` |

`PID 1`, the extension's process and its parent are never signalled; the toast
says so instead of trying. `Kill` sends the signal and reports what was sent —
a process that ignores `SIGTERM` is still there; the list says so on the next
sample.

## Kill Process

The `kill` command takes a name and signals every match: `/proc/<pid>/comm`
or the executable's own file name, **exactly** — not a substring of a command
line. The store's `pgrep -f` also matched the shell that ran it and would kill
an editor whose argument list contained the word.

## Traps

- `/proc/<pid>/stat` wraps the program name in parentheses and does not escape
  it: `(Web Content (tab 2))` is a real name. The numbered fields start after
  the **last** `)` on the line. Splitting on the first one shifts every field.
- The page size and `CLK_TCK` differ per machine and Node has no call for
  either; they are asked of `getconf` once, on the first sample, and never
  again. `test/proc.test.ts` pins the parsing, not the machine.
- A `no-view` command's argument can be absent at runtime — a deeplink carries
  no arguments, though the manifest marks the argument required and the
  generated type says it is there. Read it as `props.arguments?.processName`.
- `/proc/<pid>/io` is readable only for your own processes; the
  detail panel says `Not readable` rather than `0 B`.
- The refresh timer is cleared when the component unmounts, so a closed window
  costs nothing. Nothing polls while the view is not mounted.

## Development

```bash
npm install
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/process-manager/processes'
```

`assets/extension_icon.png` is the icon the store copy ships, kept so the fork
is recognisable as the same extension. Everything else is rewritten.
