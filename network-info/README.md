# Network Info

Local and public IP, gateway latency, DNS, per-interface throughput and the
apps using the network. Port of
[nertwork/omarchy-network-info](https://github.com/nertwork/omarchy-network-info)
v1.0.2.

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

## Prerequisites

Linux only. `ip` and `ss` from **iproute2** are required; `ping` (iputils),
`iw` (Wi-Fi details) and `resolvectl` (systemd-resolved DNS) are optional and
are resolved from `PATH`. Without `ip` the view says so and names the package;
without the others the rows they feed are simply absent.

## Network

The only requests are the public-IP lookup, to `https://ipinfo.io/json`, then
`https://api.ipify.org?format=json`, then `https://icanhazip.com`. No key and no
account. The answer is cached in Vicinae's `Cache` for five minutes. Nothing
else leaves the machine: no telemetry, no analytics.

## Preferences

| Preference | Default | Meaning |
| ---------- | ------- | ------- |
| Throughput Scope | Primary interface | Measure the primary interface, or sum every non-virtual interface. |
| Sample Every | 2 seconds | Counter sampling interval while the view is open. |
| Chart Window | 5 minutes | Span of the sparkline. Half an hour of samples is kept regardless. |
| Throughput Chart | on | Draw the sparkline in the throughput rows. |
| Active Applications | on | Run `ss` while the view is open. Only sockets owned by this user get a process name. |

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

## Not verified

Checked here on 2026-11-07: both commands load and run with an empty stderr;
the main view rendered addresses, gateway ping, DNS, the Wi-Fi row and the
public IP (read from a screenshot); `Copy Public IP` put the address on the
Wayland clipboard. 53 headless checks cover the parsers, rate arithmetic,
sparkline, formatters and the public-IP fallback order.

Not verified:

- the sparkline's block rows as pixels — the string is checked as a pure
  function, not seen aligned in the pane;
- ethernet link speed/duplex (this machine's wired port has no carrier) and any
  VPN or tailscale interface;
- a global IPv6 row (none assigned here);
- a real public-endpoint outage — the fallback and `offline` paths are checked
  against a stubbed `fetch`;
- the `All interfaces` scope with several live interfaces, and every preference
  other than the defaults.

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
