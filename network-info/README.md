# Network Info

Local and public IP, gateway latency, DNS, per-interface throughput, the apps
using the network, and a speed test. Ports of
[nertwork/omarchy-network-info](https://github.com/nertwork/omarchy-network-info)
v1.0.2 and [imzihuailin/speedtest-map](https://github.com/imzihuailin/speedtest-map)
v1.0.0.

## What it shows

- Connection: primary interface, type, IPv4 with prefix and netmask, IPv6 when
  assigned, MAC, ethernet link speed and duplex, gateway ping, DNS from
  `resolvectl`.
- Wi-Fi: SSID, signal in dBm, frequency and bitrates from `iw`; no invented
  percentage.
- Public IP: address, hostname, organisation, location. Cached five minutes; a
  failed lookup shows the last answer as `Stale`, or `Offline`.
- Throughput: smoothed rates from `/proc/net/dev`, peak, session total, and a
  sparkline; other up interfaces with their own rates.
- Applications: processes with established non-loopback sockets, their peers and
  byte counts.
- Speed test: download, upload, ping and jitter with provider, server, location
  and distance. Nothing runs until it is started; the same row stops a run.

**Copy All Information** (`cmd+shift+c`) puts the whole view on the clipboard.

## Requirements

Linux only. `ip` and `ss` from iproute2 are required; `ping`, `iw` and
`resolvectl` are optional, and the rows they feed disappear without them.

The speed test needs either Ookla Speedtest 1.2.0+ (live readings; run it once
in a terminal to accept the terms) or Python `speedtest-cli` (result at the end
only). The binary is found on `PATH`, then `~/.local/bin`, or through the CLI
Path preference; anything that is neither backend is rejected.

## Network

The only requests are the public-IP lookup: `ipinfo.io/json`, then
`api.ipify.org`, then `icanhazip.com`, cached for five minutes. The speed test's
requests are the test itself, to speedtest.net's server directory and the chosen
server. No key, no account, no telemetry.

## Preferences

| Preference | Default |
| --- | --- |
| Throughput Scope | primary interface (or all non-virtual) |
| Sample Every | 2 seconds |
| Chart Window | 5 minutes |
| Throughput Chart | on |
| Active Applications | on |
| CLI Path | empty (`speedtest` on `PATH`, then `~/.local/bin`) |

## Not verified

The main view, the Wi-Fi row, the public IP, both speedtest backends and Copy
Public IP were run. Not seen: the sparkline and distance rows as pixels,
ethernet link speed (no carrier here), a global IPv6 row, a real public-endpoint
outage, All Interfaces mode, the Ookla finished frame in the panel, Copy All
Information, and the test start/stop/copy/open actions.
