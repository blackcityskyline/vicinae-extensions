# Audit: Transmission over its own RPC

Everything below was measured on this machine on 2026-11-12 against
`transmission-daemon 4.1.4` (`transmission-cli 4.1.4-2`, Arch), started in a throwaway
config under `/tmp` on port 19091 and deleted afterwards.

## What the daemon answers

Not running by default here: nothing listens on `127.0.0.1:9091` and no
`transmission-daemon` process exists. The extension therefore has to explain an
unreachable host instead of showing an empty list.

The protocol is one endpoint and one handshake:

| Call | Answer |
| --- | --- |
| `POST /transmission/rpc` with no session header | `409` plus `X-Transmission-Session-Id` |
| same, replaying that header | `200` with `{"result":"success","arguments":{…}}` |
| `session-get` | 62 keys, the useful ones `download-dir`, `speed-limit-down`, `alt-speed-enabled`, `version`, `rpc-version` (here 19) |
| `torrent-get` with explicit `fields` | `{"torrents":[…]}`; fields are selected by name, so the payload stays small |
| `torrent-add` with an all-zero hash | `"result":"success"` **and** a torrent appears with `status 4` |

That last row is the trap: `result: "success"` does not prove the link was valid.
The extension must re-read the list after an add, or it will report success on a
magnet the daemon could only stub out. `torrent-remove` with `delete-local-data`
works as documented.

Auth is HTTP Basic and only when the daemon runs with `--auth`; there is no token
dance beyond the session id. That is the whole client: ~40 lines of `fetch` plus a
`Map` of torrent ids.

## Upstream, measured

The roadmap named `FezVrasta/transmission`, which is 404 — that is the author, not a
repository. The source is `raycast/extensions` → `extensions/transmission`, three
commands:

| Command | Mode | What it does |
| --- | --- | --- |
| `listTorrents` | view | list, filter by status, start/stop/remove, per-torrent pane |
| `addNewTorrent` | view | form prefilled from the clipboard, magnet or `.torrent` file |
| `openTransmissionWebInterface` | no-view | `open()` on `http(s)://host:port` |

1212 lines of TypeScript across 17 files, `platforms: ["macOS"]`, and 16 dependencies,
14 of them not Raycast's own — two of those, `bytes` and `node-fetch`, are not imported
anywhere in `src`. It touches no macOS-only API — no Finder selection, no Spotlight, no
TUI — so nothing in it is blocked in principle.

## As-is, or a port

As-is was considered and rejected on measurement, not taste:

- `Clipboard.readText()` in `addNewTorrent` is a `view` command, which works in
  Vicinae, so that part is not the reason.
- The blocker is the dependency set. `transmission-promise`, `swr`, `ramda`,
  `polished`, `bitfield`, `date-fns`, `dedent-js`, `expand-tilde`, `pretty-bytes`,
  `raycast-toolkit`, `ts-enum-util`, `react-use` — twelve packages, each installed
  at runtime, each one a version to keep alive, for work that is a formatted string,
  a `useInterval` or a `splitEvery`.

| Cut | Reason |
| --- | --- |
| `transmission-promise` | The measured contract is one `POST` and one header. A wrapper hides the 409 handshake that the error path needs anyway |
| `swr` | One polling loop. `setInterval` in an effect, or `usePromise` from `@raycast/utils` |
| `bitfield` + `utils/renderCells.tsx` (127 lines) | Draws a per-piece progress bar out of a CSS gradient. `Detail.Metadata` shows percentage and speed; the palette is not worth a dependency |
| `polished` | `darken`/`mix` for that bar; gone with it |
| `ramda` | `splitEvery` and `equals`, used twice |
| `date-fns` | Relative time and ETA arithmetic; `Intl.RelativeTimeFormat` and one subtraction |
| `pretty-bytes`, `dedent-js`, `expand-tilde`, `ts-enum-util`, `raycast-toolkit`, `react-use` | 2–5 lines each |
| 10 `status-progress-N.png` assets | A progress arc in ten steps. Three icons say the same thing, and Vicinae's own icons are already SVGs |

What stays is the shape of the upstream: the same three commands, the same
preferences (`host`, `port`, `ssl`, `username`, `password`, `sortBy`,
`sortDirection`, `quickPaths`, `defaultDownloadDir`, `rememberStatusFilter`,
`maxFilesShown`), the same status enum 0–6, and the same torrent fields.

Estimated size: ~350 lines, no runtime dependency.

## What the extension has to prove

- Nothing running: it says why instead of showing an empty list.
- Start, stop and remove a torrent, and the list shows the new state after the call
  rather than after a manual refresh.
- Add a magnet, then re-read: a bad link is reported as bad.
- Basic auth: correct password works, wrong password is an error, not a retry storm.
- `openTransmissionWebInterface` opens `http://host:port` and does not touch the
  clipboard (a `no-view` command has none in Vicinae).
