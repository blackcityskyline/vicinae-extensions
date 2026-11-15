# Process Manager

A fork of the store's `process-manager` (author `leonkohli`), rebuilt over
`/proc` with btop as the reference for what a process row should carry.

The store copy bundles `systeminformation`, `freedesktop-icons` and `xdg-apps`
into a 328 KB minified file, reads the table through `ps`, and shows
`/proc/<pid>/comm` and nothing else — so eight Chromium processes all read
`electron` and there is no way to tell the renderer from the GPU process. Its
CPU column is `ps`'s `pcpu`, a lifetime average that never moves on a process
that has been up for hours. Its `Kill Process` command runs
`pgrep -f "<name>"` through a shell, so a name is a command line.

## What a row says

btop's columns, in a list row: **Program** is the title, **PID · user ·
Command** the subtitle, **CPU** and **MEM** the accessories.

- **Program** — `/proc/<pid>/comm`, the kernel's short name.
- **Command** — `/proc/<pid>/cmdline`, argv joined by spaces. This is what
  tells the eight `electron` rows apart (`--type=renderer`,
  `--type=gpu-process`, …). The preference `Show Path` swaps it for the
  executable.
- **CPU** — btop's formula: `100 × Δticks / Δtotal × cores`, so one saturated
  core reads 100%, from two samples rather than a lifetime average. The first
  sample has no predecessor, so the list takes a second one half a second
  later; until then every share is zero.
- **MEM** — RSS pages × the page size, in binary units (`86.5 MiB`), which is
  btop's default (`proc_mem_bytes = true`).

`Enter` opens btop's detailed panel: status, elapsed, CPU, memory, I/O read and
written, parent, user, threads, nice, and the executable. The status word comes
from btop's own table (`R` Running, `S` Sleeping, `D` Waiting, `Z` Zombie, `T`
Stopped, `t` Tracing, `K` Wakekill, `P` Parked); `I` was missing from it and is
spelled Idle here.

Kernel threads — every child of `kthreadd` (PID 2) — are hidden unless
`Show System Processes` is on. Sorting is CPU descending with memory breaking
ties, so idle rows keep a stable order. The dropdown in the search bar
(`CPU Usage` / `Memory Usage`, as in the store copy) swaps the two.

## What is not here

- **Per-application icons.** The store copy guessed one from the executable
  through `freedesktop-icons` plus `xdg-apps`, which is most of what the 328 KB
  bundle is for. btop draws none, and the question this fork answers is *which*
  process a row is, which the command line answers.
- **`ps`.** Nothing is shelled out to for the table, so there is no `ps` output
  to parse and no process spawned per refresh.

## Keybindings

| Action | Key |
| --- | --- |
| Show details | `Enter` |
| Kill (`SIGTERM`) | `ctrl+k` |
| Force Kill (`SIGKILL`), asks first | `ctrl+shift+k` |
| Copy PID | `ctrl+shift+i` |
| Copy Path | `ctrl+shift+,` |
| Reload | `ctrl+r` |

`PID 1`, the extension's own process and its parent are never signalled; the
toast says so instead of trying. `Kill` sends the signal and reports what was
sent — a process that ignores `SIGTERM` is still there, and the list will say
so on the next sample.

## Kill Process

The `kill` command takes a name and signals every match. It matches
`/proc/<pid>/comm` or the executable's own file name, **exactly**: not a
substring of a command line. The store copy's `pgrep -f` also matched the shell
that ran it, and would have killed an editor whose argument list happened to
contain the word.

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
