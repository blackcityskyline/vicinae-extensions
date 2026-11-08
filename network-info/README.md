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

**Copy All Information** (`cmd+shift+c`) is on every row and puts the whole view
on the clipboard as one text block — `Connection`, `Public IP`, `Throughput`,
`Interfaces`, `Applications`, `Speed test` — with the same values the pane shows.
A section with nothing to report is left out.

**Speedtest** is the first row of the list: a download, upload, ping and jitter
test with the provider, the server, its location, distance and the public IP.
Nothing runs until Enter: it starts a test, and the same key stops a running
one. A toast follows the run from `Testing speed…` to the two rates or the
error. Each reading rolls while its direction is being measured, then freezes
on the measured value; the Python CLI runs twice (download, then upload against
the same server) so the download lands before the upload starts. There is no
progress bar. **Copy Results** and **Open Result** appear once a result
exists.

## Prerequisites

Linux only. `ip` and `ss` from **iproute2** are required; `ping` (iputils),
`iw` (Wi-Fi details) and `resolvectl` (systemd-resolved DNS) are optional and
are resolved from `PATH`. Without `ip` the view says so and names the package;
without the others the rows they feed are simply absent.

**Speedtest** needs either **Ookla Speedtest** 1.2.0+ from
<https://www.speedtest.net/apps/cli> (the backend with live readings; run it
once in a terminal to accept its terms) or the Python **`speedtest-cli`**
package, which reports only when each run ends. The CLI is resolved from `PATH`,
then `~/.local/bin/speedtest`, or from the CLI Path preference; a binary that is
neither backend is rejected.

## Network

The only requests are the public-IP lookup, to `https://ipinfo.io/json`, then
`https://api.ipify.org?format=json`, then `https://icanhazip.com`. No key and no
account. The answer is cached in Vicinae's `Cache` for five minutes. Nothing
else leaves the machine: no telemetry, no analytics.

The speed test makes no request of its own: the selected CLI contacts
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
event stream is parsed line by line so live values update, the Python CLI's two
runs (download, then upload on the same server) go through the same state
machine, and a run stops after 120 seconds, latches its result and needs exit
code 0. The server distance comes from the Python JSON's `server.d`; Ookla
supplies no distance, so that row is absent there. The upstream config file
became the CLI Path preference; the installer, the Omarchy entry swap, demo mode,
`reducedMotion` and the connection-name probe were dropped. The measured
upstream details, the cuts and the limits are in `docs/audits/speedtest.md`.

## Not verified

Checked here on 2026-11-08: both commands load and run with an empty stderr;
the main view rendered addresses, gateway ping, DNS, the Wi-Fi row and the
public IP (read from a screenshot); `Copy Public IP` put the address on the
Wayland clipboard. The Speedtest row rendered its running state — `Stop Test`,
`Testing download…` then `Testing upload…`, CLI `speedtest-cli` — with rolling
figures that froze on the measured download, and the animated `Testing speed…`
toast, then the finished result 80 down / 73 up with the matching toast: ping
5.6 ms, Beltelecom, OJSC Minsk Television Information Networks #44795, Minsk.
An Ookla 1.2.0.84 run then rendered 80 → 89 Mbps while `Testing download…`
with latency 5.0 ms, jitter 1.5 ms, Beltelecom and server `A1`; its headless
result was 68.7 down / 49.4 up, ping 8.0 ms, jitter 10.1 ms, server `A1` #27486
and a result URL.
Opening the view without touching it reads `Not started` and leaves no
`speedtest` process running. 94 headless checks cover the parsers,
rate arithmetic, sparkline, formatters, the public-IP fallback order, the
Speedtest event reducer, progress clamping, the display rules and CLI
detection.

Not verified:

- the sparkline's block rows as pixels — the string is checked as a pure
  function, not seen aligned in the pane;
- the Distance row as pixels: `server.d` parsing and `formatKm` are checked,
  but the row was not read from a screenshot;
- ethernet link speed/duplex (this machine's wired port has no carrier); no
  tailscale interface was present;
- a global IPv6 row (none assigned here);
- a real public-endpoint outage — the fallback and `offline` paths are checked
  against a stubbed `fetch`;
- the `All interfaces` mode itself; the Interfaces section was checked with a
  dummy interface and a TUN VPN (`Meta` typed as `vpn`), and every preference
  other than the defaults;
- the Ookla backend's finished frame in the panel: its live run was read from
  screenshots, but the overlay closed before the final state; the final result
  was checked through the same code headless;
- **Copy All Information** was not pressed: the block is checked as a pure
  function against a fixed machine, and `Clipboard.copy` is the path already
  measured by `Copy Public IP`, but the action itself was not keyed;
- `Start Test`, `Stop Test`, `Copy Results`, `Open Result` and the error panel
  were not pressed; the running and finished states were reached from a
  temporary auto-start that was removed afterwards, and `Stop Test` is covered
  by the cancelled-run path in the code, not by a keystroke.

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
