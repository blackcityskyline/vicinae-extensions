# the Speedtest command, measured

Upstream is an Omarchy panel plugin, so what transfers is its behaviour. Read
from its source and answered by this machine's tools and the live CLI on
**2026-11-07**. Nothing here is recalled from a man page.

The command ships as `speedtest` inside `network-info` (source in
`network-info/src`, checks in `network-info/test`); it was measured and written
before the merge, and this audit follows it there.

## What upstream is

[`imzihuailin/speedtest-map`](https://github.com/imzihuailin/speedtest-map)
v1.0.0, id `speedtest-map`, **GPL-3.0-only**, HEAD `ab94af7` (*Remove connection
failure diagnosis instructions*, 2026-10-19). Kind `panel`, entry `Panel.qml`,
`clonedFrom: omarchy.speedtest`.

| File | Lines | Role |
| --- | --- | --- |
| `Panel.qml` | 184 | lifecycle, settings probe, CLI process, event stream, 120 s deadline |
| `OoklaOverlay.qml` | 479 | full-screen overlay: two dials, provider and server, error text |
| `Model.js` | 46 | `.pragma library`, event reduction and bytes/s to Mbps |
| `support.py` | 70 | reads `~/.config/speedtest-map/config.json`, validates the CLI |
| `install.py` | 225 | links the source into Omarchy and replaces the existing entry |
| `tools/diagnose.py` | 193 | a separate redacting diagnostic collector |

The overlay runs a test when opened, `Esc` or a background click stops it, and
`Enter` reruns a completed one. The status line follows the event phases:
*Finding a server*, *Measuring latency*, *Downloading*, *Uploading*,
*Finishing*, *Complete*.

### What it runs

Upstream requires **Ookla's official CLI** 1.2.0+ (`speedtest`, not Python
`speedtest-cli`) and gives it:

```
speedtest --format=json --progress=yes --progress-update-interval=250
```

The CLI writes one JSON object per line. Upstream's reducer consumes
`testStart`, `ping`, `download`, `upload`, `result` and `log`, with
`download.bandwidth` / `upload.bandwidth` in **bytes per second**, `ping.latency`
and `ping.jitter` in milliseconds, `isp`, `server` and `interface.externalIp`.
A finished result is latched: later download or upload events do not change it.
The panel decides failure only after the process exits, requires exit code 0 and
a complete result, and stops the process after 120 seconds. A stderr line
matching `license|gdpr|eula` becomes "run Ookla speedtest once to review its
terms".

Settings are `~/.config/speedtest-map/config.json` (`cliPath`,
`reducedMotion`); `support.py` resolves `cliPath` through `PATH`, then
`~/.local/bin/speedtest`, runs `--version` and `--help`, and rejects a binary
that is not Ookla 1.2.0+ or that lacks `--progress-update-interval`.

## This machine, measured

Arch, Wayland. The installed CLI is the **Python** one, not Ookla:

| Probe | Answer |
| --- | --- |
| `command -v speedtest` | `/usr/bin/speedtest` |
| `speedtest --version` | `speedtest-cli 2.1.3`, then `Python 3.14.9 (main, Oct 25 2026, …)` |
| package | `speedtest-cli 2.1.3-11`, repo `extra`, Apache-2.0 |
| `speedtest --help` | `--json`, `--secure`, `--server`, `--single`, `--list`, no progress flag |
| `speedtest --list` | 200, first rows are Minsk servers |
| Ookla CLI | **not installed**, so its own behaviour was not measured here |

`speedtest --json --secure` took **21.6 s** end to end. The JSON is a single
object, not a stream: `download` and `upload` are **bits per second**, `ping` is
milliseconds, `server` carries `sponsor` (the operator), `name` (the city),
`country`, `id`, `latency`, and `client` carries `isp` and `ip`. `share` was
`null` because `--share` was not requested. Two runs on the same evening
returned 70.1 / 66.0 Mbps and 86.7 / 89.0 Mbps, ping 10.2 and 5.7 ms, server
operator `OJSC Minsk Television Information Networks` and `UNET.BY`, both in
Minsk, Belarus.

The installed `--version` and `--help` are therefore enough to tell the two
CLIs apart without running a test.

## What the port carries, and what it cuts

| Upstream | Here | Why |
| --- | --- | --- |
| full-screen overlay with two animated dials | `Detail` with two large readings and a metadata pane | Vicinae has no overlay; the numbers are the content |
| live Ookla events at 250 ms | the same JSONL stream is parsed line by line and updates the view | `Detail` re-renders on React state changes |
| Python `speedtest-cli` rejected | accepted as a second backend, final result only | it is what this machine has; it reports the same download, upload, ping, provider, server and IP, but no live progress |
| `~/.config/speedtest-map/config.json` | one optional `cliPath` preference | the platform owns preferences |
| `install.py`, the Omarchy entry swap, `demo` mode | **cut** | Vicinae installs extensions; there is no entry to replace and no overlay to preview |
| `omarchy-network-status` connection name | **cut** | it is the bar's own helper. `network-info` already owns interface details |
| `reducedMotion` | **cut** | there is no animation |
| a 120 s deadline and teardown on close | `spawn` with a 120 s `SIGKILL`, aborted on unmount or `Cancel Test` | no child outlives the view |
| `--progress-update-interval=250` | kept for Ookla; `--json --secure` for the Python CLI | each CLI gets its own invocation |
| `license|gdpr|eula` stderr mapping | kept | the first Ookla run needs a terminal |
| result latching and exit code 0 required | kept | a non-zero exit fails even if a result line arrived |

The two backends are normalised into one `TestState`: provider from `client.isp`
or top-level `isp`, server operator from `server.sponsor` (Python) or
`server.name` (Ookla), city/location separately, and bytes/s vs bits/s handled
per backend. A result URL is carried only when the CLI supplies one; the Python
CLI has none without `--share`, which is not requested.

## License

Upstream is GPL-3.0-only. No upstream code is copied: the reducer, CLI probe,
formatter and view here were written for this repository against the measured
JSON shapes above. The code is MIT, like the rest of the repository.

## Not verified

- **The Ookla path was never run.** No official CLI exists on this machine. Its
  invocation, event names, field names and error mapping come from upstream's
  source and its own synthetic fixture; only the Python path was measured. The
  fixtures mark which stream is synthetic.
- **No live progress was seen.** Python `speedtest-cli` reports only the final
  object. The view shows "Testing download and upload…" until it lands.
- **No real failure was produced.** The missing-CLI, unsupported-CLI and
  non-zero-exit paths are checked against stubs and a fake executable, not
  against a broken network or a rejected license.
- **Copy Results, Open Result and Cancel Test were not pressed.** The UI was
  opened and its completed result was read from a screenshot; the actions are
  covered by reading the code, not by keystrokes.
- **No IPv6-only, proxy or VPN route was tested.** The CLI chooses the server.

## Fixtures

`test/fixtures/speedtest-python.json` keeps the measured field layout with the
ISP, IP, server and host replaced. `test/fixtures/ookla-events.jsonl` is
synthetic, built from the schema visible in upstream's `Model.js` and tests; it
is not output captured from an Ookla CLI here.
