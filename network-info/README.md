# Network Info

Local and public IP, gateway latency, DNS, per-interface throughput, the apps
using the network, and a download, upload and latency test. Ports of
[nertwork/omarchy-network-info](https://github.com/nertwork/omarchy-network-info)
v1.0.2 and
[imzihuailin/speedtest-map](https://github.com/imzihuailin/speedtest-map)
v1.0.0.

## What it shows

- **Connection** — the primary interface, its type, IPv4 with prefix and
  netmask, IPv6 when assigned, MAC, link speed and duplex on ethernet, the
  gateway and a one-packet ping to it, and the DNS servers `resolvectl` reports.
- **Wi-Fi** — SSID, signal in dBm, frequency and both bitrates, from
  `iw dev <iface> link`. No percentage is invented from dBm.
- **Public IP** — address, hostname, organisation and location. Cached for five
  minutes; when every endpoint fails the last good answer is shown marked
  `Stale`, and with no cached answer the row says `Offline`.
- **Throughput** — smoothed download and upload rate from `/proc/net/dev`, the
  peak and the session total, plus a block-character sparkline over the chosen
  window.
- **Interfaces** — every other up interface with an address and its own rates.
- **Applications** — apps owning established non-loopback sockets, with
  connections, bytes received and sent, and up to three peers each.

`Speedtest` is a separate command: a download, upload, ping and jitter test with
the provider, the server, its location and the public IP. It starts when the
view opens and offers **Run Again** (Ctrl+R), **Copy Results** (Ctrl+C),
**Open Result** when the CLI returns a URL, and **Cancel Test** (Ctrl+.) while a
test runs.

## Prerequisites

Linux only. `ip` and `ss` from **iproute2** are required; `ping` (iputils),
`iw` (Wi-Fi details) and `resolvectl` (systemd-resolved DNS) are optional and
are resolved from `PATH`. Without `ip` the view says so and names the package;
without the others the rows they feed are simply absent.

`Speedtest` needs either **Ookla Speedtest** 1.2.0+ from
<https://www.speedtest.net/apps/cli> (the only backend with live progress; run
it once in a terminal to accept its terms) or the Python **`speedtest-cli`**
package, which reports only the final result. The CLI is resolved from `PATH`,
then `~/.local/bin/speedtest`, or from the CLI Path preference; a binary that is
neither backend is rejected.

## Network

The only requests are the public-IP lookup, to `https://ipinfo.io/json`, then
`https://api.ipify.org?format=json`, then `https://icanhazip.com`. No key and no
account. The answer is cached in Vicinae's `Cache` for five minutes. Nothing
else leaves the machine: no telemetry, no analytics.

The `Speedtest` command makes no request of its own: the selected CLI contacts
speedtest.net's server directory and the chosen test server, which is the test.
For the Python CLI the port adds `--secure`, so that traffic is HTTPS. No
account, key or telemetry is involved.

## Preferences

| Preference | Default | Meaning |
| ---------- | ------- | ------- |
| Throughput Scope | Primary interface | Measure the primary interface, or sum every non-virtual interface. |
| Sample Every | 2 seconds | Counter sampling interval while the view is open. |
| Chart Window | 5 minutes | Span of the sparkline. Half an hour of samples is kept regardless. |
| Throughput Chart | on | Draw the sparkline in the throughput rows. |
| Active Applications | on | Run `ss` while the view is open. Only sockets owned by this user get a process name. |
| CLI Path | empty | Speedtest executable name or full path. Empty tries `speedtest` on `PATH`, then `~/.local/bin/speedtest`. |

## What the port changed

`ip monitor` became a poll: no event could be produced here to measure its
format. Three upstream defects measured in `docs/audits/network-info.md` are
fixed here:

- `ss -tinp state established` prints no `State` column, so upstream's parser
  skipped every row. The port reads the five-field layout it actually emits and
  sums the `bytes_sent` / `bytes_received` from the TCP-info line.
- IPv4-mapped loopback peers (`::ffff:127.0.0.1`) counted as internet traffic.
  The port strips the mapping before the loopback test.
- `iw` was documented but never called. The port reads SSID, signal, frequency
  and bitrates from it, and drops `nmcli`.

The speed test keeps the overlay's behaviour in a `Detail` panel: the Ookla JSON
event stream is parsed line by line so live values update, the Python CLI's single
final object goes through the same state machine, and a run stops after 120
seconds, latches its result and needs exit code 0. The upstream config file
became the CLI Path preference; the installer, the Omarchy entry swap, demo mode,
`reducedMotion` and the connection-name probe were dropped. The measured
upstream details, the cuts and the limits are in `docs/audits/speedtest.md`.

## Not verified

Checked here on 2026-11-07: all three commands load and run with an empty
stderr; the main view rendered addresses, gateway ping, DNS, the Wi-Fi row and
the public IP (read from a screenshot); `Copy Public IP` put the address on the
Wayland clipboard. `Speedtest` was seen running after the merge, and the merged
CLI layer completed a real run headlessly against `/usr/bin/speedtest` (55 and
35 Mbps, ping 13 ms, Beltelecom, `OJSC Minsk Television Information Networks`,
Minsk, Belarus); the completed view itself was read from a screenshot taken
before the merge, of the same code. 79 headless checks cover the parsers, rate
arithmetic, sparkline, formatters, the public-IP fallback order, the Speedtest
event reducer and CLI detection.

Not verified:

- the sparkline's block rows as pixels — the string is checked as a pure
  function, not seen aligned in the pane;
- ethernet link speed/duplex (this machine's wired port has no carrier) and any
  VPN or tailscale interface;
- a global IPv6 row (none assigned here);
- a real public-endpoint outage — the fallback and `offline` paths are checked
  against a stubbed `fetch`;
- the `All interfaces` scope with several live interfaces, and every preference
  other than the defaults;
- **the Ookla Speedtest backend** — its CLI is not installed here, so its argv
  and event schema come from upstream's source and a synthetic fixture; only the
  Python backend ran;
- `Copy Results`, `Open Result` and `Cancel Test` were not pressed, and the
  Speedtest error view was not seen: the missing-CLI, unsupported-CLI and
  non-zero-exit paths are covered by stubs and a fake executable.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/network-info/network-info'
vicinae 'vicinae://launch/@black/network-info/copy-public-ip'
vicinae 'vicinae://launch/@black/network-info/speedtest'
```
