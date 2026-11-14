# network-info, measured

Upstream is an Omarchy bar widget, so there is no launcher code to deploy: what
transfers is the behaviour. Everything below was read from its source or answered
by this machine's tools and by the live endpoints on **2026-11-07**.

## What upstream is

[`nertwork/omarchy-network-info`](https://github.com/nertwork/omarchy-network-info)
v1.0.2, id `nertwork.network-info`, MIT, `omarchyVersion >=4.0.0`, HEAD
`da5c556` (*fix(security): reject HTTP 3xx redirects without draining response
bodies*). Kind `bar-widget`, activation on-demand.

| File | Lines | Role |
| --- | --- | --- |
| `Panel.qml` | 1774 | bar button, popover, six `Process` children, four timers, the canvas chart |
| `bin/network-info.py` | 529 | stdlib-only collector; `--local`, `--public`, `--public-cached`, `--all` |
| `Model.js` | 221 | `.pragma library`; formatters and the two text parsers |
| `manifest.json` | 130 | eight settings, their enums and defaults |
| `tests/model-test.mjs` | 88 | node asserts over `Model.js` in a `vm` context |
| `README.md` | 92 | highlights, install, dependencies, controls, IPC |

### Where its data comes from

| Datum | Command or file | Notes |
| --- | --- | --- |
| primary interface, source IP, gateway | `ip -j route get 1.1.1.1`, falling back to `ip -j route show default` | a route *probe*, not a ping: no packet leaves |
| addresses, MAC, flags, operstate, prefixes | `ip -j addr show` | `lo` skipped |
| interface type | `/sys/class/net/<if>/wireless`, then the name prefix, then `POINTOPOINT` | `wifi` / `ethernet` / `tailscale` / `vpn` / `other` |
| link speed and duplex | `/sys/class/net/<if>/{speed,duplex}` | ethernet only, and only when primary or `UP` |
| Wi-Fi SSID | `nmcli -t -f GENERAL.CONNECTION dev show <if>` | primary wireless only; this is the *connection profile* name |
| gateway latency | `ping -c 1 -W 1 <gw>` | first `time=` or `time<` on stdout |
| DNS | `resolvectl dns` | tokens split on `%` and `#`, `fd*`/`fe80*` dropped, sorted set |
| byte counters | `cat /proc/net/dev` | rx = field 0, tx = field 8 |
| per-app sockets | `ss -tinp state established` | see the bug below |
| change events | `ip monitor address route` | restarted after 2 s, debounced 350 ms |
| public IP and geo | `https://ipinfo.io/json` → `https://api.ipify.org?format=json` → `https://icanhazip.com` | 16 KiB cap, redirects refused, 3 s socket / 6 s fetch / 10 s hard alarm |

Refresh cadence: counters every `max(1000, speedInterval)` ms, sockets every
2.5 s **only while the popover is open and `showPerApp`**, local every 30 s,
public every 300 s. Public answers are cached 300 s in
`~/.cache/omarchy/network-info-public.json`, and a stale cache is served with
`status: "stale"` when a fetch fails. Settings live in
`${XDG_STATE_HOME:-~/.local/state}/omarchy/settings/nertwork.network-info.json`.

### Its rate arithmetic (`Panel.qml:225`)

Kept by the port and asserted by the checks:

```
dt        = max(0.25, (now - prevAt) / 1000)      only when prev.iface === sample.iface
dRx, dTx  = max(0, counter - prevCounter)         a reset counter reads as zero, not as a spike
inst      = d / dt
smooth    = smooth > 0 ? smooth * 0.45 + inst * 0.55 : inst
peak      = max(peak, smooth)                     peak of the smoothed rate, not of inst
session  += d
history   = entries with t >= now/1000 - 1810, then {t, down: smooth, up: smooth}
```

The 0.25 s floor under-reports a rate when samples arrive faster than that; the
iface guard means a scope change costs one interval of baseline. Both are kept.

## This machine, measured

Arch, Hyprland/Wayland. `iproute2-7.3.0` (`ip` and `ss`, libbpf 1.7.0), `iw` 6.17,
`python3`, `ping`, `nmcli`, `resolvectl`, `wl-copy` all present in `/usr/bin`.
Primary interface `wlp3s0` (wireless, `UP`), `enp4s0f2` present but `NO-CARRIER`
with zero counters, `lo` only.

| Probe | Answer |
| --- | --- |
| `ip -j route get 1.1.1.1` | one object: `dev wlp3s0`, `gateway 192.168.1.1`, `prefsrc` a private RFC1918 address, `flags []` |
| `ip -j route show default` | the same, plus `protocol dhcp`, `metric 500` |
| `ip -j addr show` | three links. `wlp3s0` has one `inet` `/24` `scope global dynamic` and one `inet6` `fe80::…` `scope link` — **no global IPv6 here**, so the IPv6 row cannot be exercised |
| `ip -s link show wlp3s0` | RX 4626543795 / TX 432269018 at that instant; agrees with `/proc/net/dev` read alongside it, which is the cross-check the counter parser is asserted against |
| `cat /sys/class/net/wlp3s0/speed` | **`Invalid argument`** — the file exists on a wireless interface and reading it fails with EINVAL. `duplex` likewise. Upstream only reads them for ethernet, so it never hits this |
| `iw dev wlp3s0 link` | `SSID`, `freq: 2442.0`, `signal: -29 dBm`, `rx bitrate: 150.0 MBit/s MCS 7 40MHz short GI`, `tx bitrate` the same |
| `nmcli -t -f GENERAL.CONNECTION dev show wlp3s0` | `GENERAL.CONNECTION:<profile>` — one line, and it answered the same string as `iw`'s SSID here |
| `ping -c 1 -W 1 192.168.1.1` | `time=1.10 ms`; the statistics line reads `rtt min/avg/max/mdev = 1.099/1.099/1.099/0.000 ms` |
| `resolvectl dns` | `Global: 1.1.1.1 8.8.8.8`, `Link 3 (wlp3s0): 1.1.1.1 1.0.0.1`, `Link 2 (enp4s0f2):` with nothing after the colon |
| `timeout 20 ip monitor address route link` | **no output at all** in twenty seconds of passive observation |

### The public endpoints, all three live

`curl -m 6`, upstream's own `User-Agent: OmarchyNetworkInfo/1.0`:

| Endpoint | Status | Redirect | Bytes | Seconds | Body |
| --- | --- | --- | --- | --- | --- |
| `https://ipinfo.io/json` | 200 | none | 352 | 0.21 | `ip`, `hostname`, `city`, `region`, `country`, `loc`, `org`, `postal`, `timezone`, `readme` |
| `https://api.ipify.org?format=json` | 200 | none | 20 | 0.24 | `{"ip":"…"}` |
| `https://icanhazip.com` | 200 | none | 12 | 0.14 | the bare address and a newline |

All three returned the same egress address; `ipinfo.io` alone answers with
organisation and location, so it stays first and the other two stay as
address-only fallbacks. No key was needed.

## Three defects in upstream, measured

### 1. The per-app card is always empty

`Panel.qml:513` runs `ss -tinp state established`. A state filter makes `ss`
**omit the `State` column**; the real header on iproute2-7.3.0 is:

```
Recv-Q   Send-Q       Local Address:Port        Peer Address:Port Process
0        0              192.168.1.5:35164      193.176.84.29:9002  users:(("zen-bin",pid=20262,fd=109))
	 cubic wscale:7,10 rto:340 rtt:136.496/16.51 … bytes_sent:11594 bytes_received:324914 send 675185bps …
```

Five whitespace-separated fields, then an indented TCP-info continuation line.
`Model.parseSS` bails at `if (parts.length < 6) continue`, so **every row is
skipped**; upstream's own function returns `[]` on the captured output:

```
$ node -e '… ctx.parseSS(fs.readFileSync("ss-established.txt","utf8"))'
[]
```

`ss -tinp` without the filter does print `State`, gives six fields, and the same
function returns 4 apps: the parser expects a layout its caller does not produce.

The port parses the emitted layout — `Recv-Q`, `Send-Q`, local, peer, process —
and attaches the following indented line to its socket. That line carries
`bytes_sent` and `bytes_received`, which upstream throws away; the port sums them
per application, because the queue backlog it sorts on is `0` on both directions
for **31 of the 33** established sockets measured here — the two that are not
both belong to loopback peers, so once defect 2 is fixed every remaining socket
ties at zero and upstream's ordering degenerates to connection count and then
alphabetical.

### 2. Loopback sockets are counted as internet traffic

Upstream skips a peer starting `127.0.0.1:` or `[::1]:`. On `ss -tinp` output it
still returned an app whose only peer was `[::ffff:127.0.0.1]` — an IPv4-mapped
loopback address, which matches neither prefix. This machine has several such
sockets (a local media server and a local editor backend, one with a 30 MB receive
queue). The port strips a `::ffff:` prefix before testing loopback.

### 3. `iw` is a documented dependency that is never run

`README.md:68` advertises "**`iw` (optional)** — Used to display Wi-Fi SSID,
frequency, and signal strength (`dBm`)". `grep -n iw bin/network-info.py` finds
nothing: the SSID comes from `nmcli`, `primary.signal` is initialised to `""` at
line 140 and never assigned, and `Panel.qml:174` reads that empty string into
`wifiSignal`. Frequency is never collected either.

The port runs `iw dev <iface> link` for the primary wireless interface and reads
SSID, signal in dBm, frequency and both bitrates from it — measured working above.
`nmcli` is dropped: it needs NetworkManager, `iw` does not, and `iw` answers with
the SSID rather than the profile name. Signal is shown in dBm as measured; no
percentage is invented, because there is no standard mapping from dBm to one.

## What the port carries into Vicinae, and what it cuts

Vicinae has no bar widget on Linux — `docs/authoring-extensions.md` says `menu-bar`
is the macOS menu bar and Linux-only extensions should not use it. The popover
becomes a `List` with a detail metadata pane; the bar becomes nothing.

| Upstream | Here | Why |
| --- | --- | --- |
| popover cards | `List.Section` rows with `List.Item.Detail.Metadata` | the native equivalent; every field keeps its own copy action |
| `wl-copy --` | `Clipboard.copy` | API-001: shelling out to `wl-copy` duplicates the platform |
| canvas throughput chart | a two-row block-character sparkline in the detail pane | there is no canvas and no chart component. Verified rendered, or cut — see *Not verified* |
| `displayMode`, `barSpeedMode`, `hideSpeedWhenIdle` | **cut** | all three choose what a bar button prints. There is no bar button |
| `interfaceScope`, `speedInterval`, `chartWindow`, `showGraph`, `showPerApp` | preferences, same names and enums | they change what is collected and drawn, not how a bar is laid out |
| `ip monitor address route` | **cut**, replaced by a poll | twenty seconds of passive observation produced no event, and generating one means changing interface state, which is outside this repository. The format is therefore unmeasured, and rule 7 forbids writing a guess into code. A long-lived netlink child would also need a teardown guarantee PROCESS-001 asks for. Local info is polled instead |
| the Python collector | TypeScript under `src/api/` | the runtime is Node; a bundled interpreter script would be a second language and a second failure surface for the same `execFile` calls |
| `~/.cache/omarchy/…json`, the settings file | `Cache` and `getPreferenceValues` | the platform owns both; no hand-rolled state file |
| `signal.SIGALRM` hard deadlines | `AbortSignal.timeout` on `fetch`, `timeout` on `execFile` | the Node equivalents, per call rather than per process |
| `sanitize_str` stripping `<>"'` and HTML tags | `sanitizeText` stripping control characters, `net.isIP` for addresses | the values land in a native metadata pane, not a markup sink. `node:net.isIP` is the standard library's validator and replaces `ipaddress` |
| IPC `toggle`/`refresh`/`cycle`/`setMode` | **cut** | `omarchy-shell ipc` is the widget host's own bus. Vicinae's deeplink launches the command, and refresh is an action |
| nerd-font glyphs (`󰈀 󰤨 󰖟 …`) | `Icon` from `@vicinae/api` | the glyph codepoints need a patched font the launcher does not ship |

## Fork addition: one copy for the whole view

**Copy All Information** (`cmd+shift+c` on every row) puts one plain-text block
on the clipboard: `Connection`, `Public IP`, `Throughput`, `Interfaces`,
`Applications`, `Speed test`, in that order, each row `  Label: value` with the
pane's values — prefix and netmask, gateway ping, DNS, SSID, signal, bitrates,
peak and session totals, per-interface rates, per-app connections and bytes,
peers, `resultText`. Sections with absent data are omitted, not printed empty;
`Throughput` always prints. `src/utils/summary.ts` takes no I/O, so
`test/summary.test.ts` covers it headless.

## Not verified

- **The sparkline and detail pane are unseen rendered.** They are checked as pure
  functions against hand-computed vectors; whether the markdown pane keeps a
  block-character row aligned is a runtime question, answered after the build by
  capturing the window with `grim`.
- **No global IPv6 here**, so the IPv6 row, its prefix and its copy action are
  unexercised. The parser is checked against a synthetic `inet6` `scope global`
  entry in the shape `ip -j addr show` documented above.
- **No ethernet link here**: `enp4s0f2` is `NO-CARRIER`, so sysfs `speed`/`duplex`
  on a live wired interface were not read. The EINVAL behaviour of those files on
  a *wireless* interface was.
- **`ip monitor` event format** — see the cut above.
- **A VPN or tailscale interface** was not present, so those type branches come
  from upstream's source, not this host.
- **Offline behaviour**: the three endpoints all answered; a fetch failure path is
  checked against a stubbed rejection, not a real outage.

## Fixtures

`test/fixtures/` holds output captured from the commands above, with the SSID,
MAC, public address, peer addresses and process names replaced. The column
layout, field order, `ss` continuation indentation and `/proc/net/dev` header are
the measured ones, because those are what a parser gets wrong. The personal
values are not under test and do not belong in a repository.
