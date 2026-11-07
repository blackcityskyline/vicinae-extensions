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

**Speedtest** is the first row of the list: a download, upload, ping and jitter
test with the provider, the server, its location and the public IP. Enter starts
a test, and the same key stops a running one; a toast follows the run from
`Testing speed…` to the two rates or the error. The panel shows Ookla's live
readings and a progress bar built from its `progress` field; the Python CLI
reports only once, so it gets no bar. **Copy Results** and **Open Result**
appear once a result exists.

## Prerequisites

Linux only. `ip` and `ss` from **iproute2** are required; `ping` (iputils),
`iw` (Wi-Fi details) and `resolvectl` (systemd-resolved DNS) are optional and
are resolved from `PATH`. Without `ip` the view says so and names the package;
without the others the rows they feed are simply absent.

**Speedtest** needs either **Ookla Speedtest** 1.2.0+ from
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

Checked here on 2026-11-08: both commands load and run with an empty stderr;
the main view rendered addresses, gateway ping, DNS, the Wi-Fi row and the
public IP (read from a screenshot); `Copy Public IP` put the address on the
Wayland clipboard. The Speedtest row rendered its running state — `Stop Test`,
`Testing download and upload…`, CLI `speedtest-cli` — with the animated
`Testing speed…` toast, then the finished result (80 and 77 Mbps) with the
`80 Mbps down · 77 Mbps up` toast: the earlier run read 63 and 67 Mbps, ping
23 ms, Beltelecom, UNET.BY #3704, Minsk. 87 headless checks cover the parsers,
rate arithmetic, sparkline, formatters, the public-IP fallback order, the
Speedtest event reducer, progress clamping, the display rules and CLI
detection.

Not verified:

- the sparkline's block rows as pixels — the string is checked as a pure
  function, not seen aligned in the pane;
- the progress bar as pixels: only Ookla emits `progress`, and its CLI is not
  installed here, so the bar is checked as a string (`██████████░░░░░░░░░░  50%`)
  against the fixture's ratio, not seen filling in the pane;
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
- the live Speedtest progress, `Stop Test`, `Copy Results`, `Open Result` and the
  error panel were not exercised; the running result was laid out by driving the
  row's start from a temporary auto-start so the two states could be photographed,
  and `Stop Test` is covered by the cancelled-run path in the code, not by a
  keystroke.

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
```
