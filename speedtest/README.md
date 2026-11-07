# Speedtest

Measure download, upload, ping and jitter, and name the provider and the server
that served the test. Port of
[imzihuailin/speedtest-map](https://github.com/imzihuailin/speedtest-map), an
Omarchy panel plugin.

## What it does

The view starts a test when it opens. While it runs it shows the current
download and upload readings, the phase and the latency; it finishes with the
result, the provider, the server, its location and the public IP, and offers
**Run Again** (Ctrl+R), **Copy Results** (Ctrl+C), **Open Result** (Ctrl+O)
when the CLI returns a URL, and **Cancel Test** (Ctrl+.) while a test runs.

## Prerequisites

Either CLI, resolved from `PATH` or the **CLI Path** preference:

- **Ookla Speedtest** 1.2.0+ from <https://www.speedtest.net/apps/cli>. This is
  the upstream requirement and the only backend that reports live progress. Run
  it once in a terminal to accept its terms.
- **`speedtest-cli`** (the Python one), package `speedtest-cli` in Arch's
  `extra` repository. It reports the final result only; there is no progress
  while it runs.

The extension tells the two apart from `--version` and `--help`, and rejects a
binary that is neither.

## Network

The extension makes no HTTP requests itself. The selected CLI contacts
speedtest.net's server directory and the chosen test server, which is the test.
For the Python CLI the port adds `--secure`, so that traffic is HTTPS. No
account, key or telemetry is involved. `Copy Results` and `Open Result` act on
the CLI's own output.

## Preferences

| Preference | Default | Meaning |
| ---------- | ------- | ------- |
| CLI Path | empty | Executable name or full path. Empty tries `speedtest` on `PATH`, then `~/.local/bin/speedtest`. |

## What the port changed

The overlay's two dials became a `Detail` panel with the same readings. The
Ookla JSON event stream is parsed line by line, so live values update; the same
state machine also accepts the Python CLI's single final object. The config file
became the CLI Path preference. The installer, the Omarchy entry swap, demo
mode, `reducedMotion` and the connection-name probe were dropped.

Upstream is GPL-3.0-only; no upstream code was copied. The implementation here
was written against the measured CLI output in
`docs/audits/speedtest.md` and is MIT.

## Not verified

The Python backend was run end to end here (21.6 s, 70.1/66.0 and 86.7/89.0
Mbps), and the completed view was read from a screenshot. The Ookla backend
never ran because the official CLI is not installed on this machine: its
invocation and event schema come from upstream's source and its synthetic
fixture. Copy Results, Open Result and Cancel Test were not pressed; the missing
CLI, unsupported CLI and non-zero-exit paths are checked with stubs, not a real
outage. Details in `docs/audits/speedtest.md`.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/speedtest/speedtest'
```
