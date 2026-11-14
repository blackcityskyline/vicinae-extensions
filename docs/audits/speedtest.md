# Speedtest — Omarchy panel plugin, measured port

Upstream is an Omarchy panel plugin; read from its source and answered by this machine's tools and the live CLI
on 2026-11-07.

The command ships as the `Speedtest` row at the end of the Network Info list (source in `network-info/src`,
checks in `network-info/test`).

## Upstream

[`imzihuailin/speedtest-map`](https://github.com/imzihuailin/speedtest-map) v1.0.0, id `speedtest-map`,
**GPL-3.0-only**, HEAD `ab94af7` (*Remove connection failure diagnosis instructions*, 2026-10-19). Kind `panel`,
entry `Panel.qml`, `clonedFrom: omarchy.speedtest`.

| File | Lines | Role |
| --- | --- | --- |
| `Panel.qml` | 184 | lifecycle, settings probe, CLI process, event stream, 120 s deadline |
| `OoklaOverlay.qml` | 479 | full-screen overlay: two dials, provider and server, error text |
| `Model.js` | 46 | `.pragma library`, event reduction and bytes/s to Mbps |
| `support.py` | 70 | reads `~/.config/speedtest-map/config.json`, validates the CLI |
| `install.py` | 225 | links the source into Omarchy and replaces the existing entry |
| `tools/diagnose.py` | 193 | a separate redacting diagnostic collector |

The overlay runs a test when opened, `Esc` or a background click stops it, and `Enter` reruns a completed one.
The status line follows the event phases: *Finding a server*, *Measuring latency*, *Downloading*, *Uploading*,
*Finishing*, *Complete*.

### What it runs

Upstream requires **Ookla's official CLI** 1.2.0+ (`speedtest`, not Python `speedtest-cli`):

```
speedtest --format=json --progress=yes --progress-update-interval=250
```

The CLI writes one JSON object per line. Upstream's reducer consumes `testStart`, `ping`, `download`, `upload`,
`result` and `log`, with `download.bandwidth` / `upload.bandwidth` in **bytes per second**, `ping.latency` and
`ping.jitter` in milliseconds, `isp`, `server` and `interface.externalIp`. A finished result is latched: later
download or upload events do not change it. The panel decides failure only after the process exits, requires exit
code 0 and a complete result, and stops the process after 120 seconds. A stderr line matching `license|gdpr|eula`
becomes "run Ookla speedtest once to review its terms".

Settings are `~/.config/speedtest-map/config.json` (`cliPath`, `reducedMotion`); `support.py` resolves `cliPath`
through `PATH`, then `~/.local/bin/speedtest`, runs `--version` and `--help`, and rejects a binary that is not
Ookla 1.2.0+ or that lacks `--progress-update-interval`.

## This machine

Arch, Wayland. Both backends are installed, and `PATH` resolves Ookla first:

| Probe | Answer |
| --- | --- |
| `command -v speedtest` | `/usr/local/bin/speedtest` (Ookla), then `/usr/bin/speedtest` (Python) |
| `speedtest --version` | `Speedtest by Ookla 1.2.0.84 (ea6b6773cf) Linux/x86_64-linux-musl`; `/usr/bin/speedtest` says `speedtest-cli 2.1.3`, then `Python 3.14.9` |
| package | Ookla's official static ELF, 2.5 MB, from `install.speedtest.net`; `speedtest-cli 2.1.3-11`, repo `extra` |
| `speedtest --help` | Ookla accepts `--format=json`, `--progress=yes`, `--progress-update-interval`, `--accept-license`, `--accept-gdpr`; Python has `--json`, `--secure`, `--server`, `--single`, `--list` and no progress flag |
| `speedtest --list` | 200, first rows are Minsk servers |

`--version` and `--help` are enough to tell the two CLIs apart without running a test.

### Python backend

`speedtest --json --secure` took **21.6 s** end to end. Split so each direction lands on its own,
`--json --secure --no-upload` took about 9 s and `--json --secure --no-download --server <id>` about 8 s, both
exit 0 with empty stderr. The JSON is a single object, not a stream: `download` and `upload` are **bits per
second**, `ping` is milliseconds, `server` carries `sponsor` (the operator), `name` (the city), `country`, `id`,
`latency` and `d` (the distance in kilometres from the client), and `client` carries `isp` and `ip`. `share` was
`null` because `--share` was not requested. Two runs on the same evening returned 70.1 / 66.0 Mbps and
86.7 / 89.0 Mbps, ping 10.2 and 5.7 ms, server operator `OJSC Minsk Television Information Networks` and
`UNET.BY`, both in Minsk, Belarus.

### Ookla backend

1.2.0.84 was accepted once with `--accept-license --accept-gdpr`, then run through the extension's own
`runSpeedtest`. It wrote 107 JSONL lines (`testStart`, `ping`, `download`, `upload`, `result`) and finished in
about 35 s: 68.7 Mbps down, 49.4 Mbps up, ping 8.0 ms, jitter 10.1 ms, provider Beltelecom, server `A1` #27486 in
Minsk, and a `speedtest.net/result/c/…` URL. A raw run from the shell returned 78.5 / 75.5 Mbps. Ookla's `server`
object has `id`, `host`, `port`, `name`, `location`, `country` and `ip` but no distance field, so `distanceKm`
stays `null` and the launcher omits the Distance row. The first accepted run still prints the license banner to
stderr on success; the stored acceptance silences later runs.

## What the port carries, and what it cuts

| Upstream | Here | Why |
| --- | --- | --- |
| full-screen overlay with two animated dials | `Detail` with two large readings and a metadata pane | Vicinae has no overlay; the numbers are the content |
| live Ookla events at 250 ms | the same JSONL stream is parsed line by line and updates the view | `Detail` re-renders on React state changes |
| Python `speedtest-cli` rejected | accepted as a second backend, run twice | it is what this machine has; `--no-upload` fixes the download, then `--no-download --server <id>` measures upload on the same server, so the download freezes before upload starts |
| `~/.config/speedtest-map/config.json` | one optional `cliPath` preference | the platform owns preferences |
| `install.py`, the Omarchy entry swap, `demo` mode | **cut** | Vicinae installs extensions; there is no entry to replace and no overlay to preview |
| `omarchy-network-status` connection name | **cut** | the bar's own helper. `network-info` already owns interface details |
| `reducedMotion` | **cut** | there is no animation |
| a 120 s deadline and teardown on close | `spawn` with a 120 s `SIGKILL`, aborted on unmount or `Stop Test` | no child outlives the view |
| `--progress-update-interval=250` | kept for Ookla; the Python CLI gets `--json --secure --no-upload`, then `--json --secure --no-download --server <id>` | each CLI gets its own invocation; two Python runs make its download real rather than rolling |
| `license|gdpr|eula` stderr mapping | kept | the first Ookla run needs a terminal |
| result latching and exit code 0 required | kept | a non-zero exit fails even if a result line arrived |

Both backends normalise into one `TestState`: provider from `client.isp` or top-level `isp`, server operator from
`server.sponsor` (Python) or `server.name` (Ookla), city/location separately, bytes/s vs bits/s per backend. A
result URL is carried only when the CLI supplies one; the Python CLI has none without `--share`.

## License

Upstream is GPL-3.0-only. No upstream code is copied: the reducer, CLI probe, formatter and view here were written
for this repository against the measured JSON shapes above. The code is MIT, like the rest of the repository.

## Not verified

- **Ookla's final frame was not seen in the panel.** The live run was read from screenshots (80 then 89 Mbps,
  `Testing download…`, latency 5.0 ms, jitter 1.5 ms, Beltelecom, server `A1`, `Stop Test`), but the overlay
  closed before the finished state; the final result comes from the same code run headless. The fixture is
  synthetic, not captured output.
- **Python has no live progress.** `speedtest-cli` reports only at the end of each run, so the view rolls a figure
  while a direction is measured and replaces it when that run lands (seen freezing at 80 Mbps before the upload
  run). There is no progress bar. Ookla's `progress` ratio drives its live values, seen against the real CLI.
- **No real failure was produced.** The missing-CLI, unsupported-CLI and non-zero-exit paths are checked against
  stubs and a fake executable, not a broken network or a rejected license.
- **Start Test, Copy Results, Open Result and Stop Test were not pressed.** The row was selected; its running and
  finished states came from screenshots launched by a temporary auto-start, removed afterwards. Opening the view
  then read `Not started` and left no `speedtest` process. The extra actions are covered by reading the code. The
  `Testing speed…` and `80 Mbps down · 73 Mbps up` toasts came from the same screenshots.
- **No IPv6-only route was tested.** A TUN VPN was: `miho` created `Meta` (198.18.0.1/30), `readLocalInfo` typed
  it `vpn`, and the panel showed `198.18.0.1 Meta · vpn` with gateway and DNS. A dummy interface with
  10.99.0.1/24 also appeared in the Interfaces section, with its own detail and zero rates.

## Fixtures

`test/fixtures/speedtest-python.json` keeps the measured field layout with the ISP, IP, server and host replaced.
`test/fixtures/ookla-events.jsonl` is synthetic, built from the schema visible in upstream's `Model.js` and tests;
it is not output captured from an Ookla CLI here.
