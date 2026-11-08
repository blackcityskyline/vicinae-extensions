# Miho

Control [mihomo](https://github.com/MetaCubeX/mihomo) from Vicinae: proxy and TUN
modes, node selection, provider refresh, live connections, egress IP and the log.

The extension never calls `~/bin/others/miho`. Both drive the same objects, so
either can take over at any moment:

| Object | Path |
| --- | --- |
| proxy config | `~/.config/mihomo/config.yaml` |
| generated TUN config | `~/.config/mihomo/config-tun.yaml` |
| mode ledger | `~/.config/miho/state` (`MODE=proxy\|tun`) |
| pid hint and log | `~/.config/miho/mihomo.pid`, `mihomo.log` |
| controller, mixed proxy | `127.0.0.1:7891`, `127.0.0.1:7890` |

The live process and its `-f` argument are the truth; the state file is read only
when nothing runs and written on every mode change so `miho status` agrees with
the launcher. Opening the command starts neither a test nor a daemon.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `miho` | view | Status, groups, nodes, providers, connections, IP and log |
| `Toggle mihomo` | no-view | Starts or stops the daemon in the last used mode |

### Views and actions

| View | Shows | Actions |
| --- | --- | --- |
| Status | mode, mihomo mode, routing rule, pid, tags for running, TUN, routing and `Meta` | Start/Stop, Restart, Switch TUN/Proxy, Rule/Global/Direct mode, Route Direct/Through Proxy, Show Connections, Test Proxy, Check IP, Show Log, Diagnostics, Copy Proxy Address, Open Config |
| Groups | type and selected node, including `GLOBAL` | Open Nodes |
| Nodes | side panel: type, provider, capabilities, last check, health | Select Node, Test All Nodes, Copy Node Name |
| Providers | vehicle, node count, quota, expiry, last update | Update Provider, Update All Providers, Copy Provider Name |
| Connections | host, process, rule, chain, per-socket traffic | Close Connection, Close All Connections, Copy Host/Destination/Chain, Refresh |
| Check IP | direct address and address through the SOCKS proxy | Check Again, Copy |
| Log | tail of `mihomo.log` | Refresh, Pause, Copy Log, Open Log File |
| Diagnostics | core version and build, controller reachability, config paths, geo files, config test | Test Config, Copy Core Version, Open Config/TUN Config, Show Log, Refresh |

The node list's search-bar dropdown orders by delay, reachability or name. A
failed check reads `timeout` and sorts last; the list opens with the delays the
controller already measured, then tests every node again. Selecting a node also
points `PROXY` at that group, because the last rule is `MATCH,PROXY`.

## Prerequisites

- `mihomo` at `/usr/bin/mihomo`
- `~/.config/mihomo/config.yaml`; the TUN copy is generated and checked with
  `mihomo -t` before use
- root for TUN mode and for stopping a root daemon: a cached `sudo` credential,
  or `pkexec` with polkit and an authentication agent
- `ip`, `resolvectl`, `curl`, `pgrep`

## Authorization

`mihomo` runs as root in TUN mode, and a root daemon needs root to be signalled
and to lose its `Meta` link. The order:

1. `sudo -n` — silent; the only path with no window.
2. `pkexec` — one polkit dialog per action. `org.freedesktop.policykit.exec` is
   `auth_admin` (not `_keep`), so one user action is one script, not one prompt
   per command: a TUN start launches the daemon, waits for `Meta`, restores
   ownership and sets the resolver; a stop signals every pid and deletes both
   links.

`pkexec` runs with `--disable-internal-agent`, otherwise a launcher with no
terminal falls back to the textual agent and fails with
`No such device or address`. The extension starts
`polkit-gnome-authentication-agent-1` when none runs.

The `mihoctl` helper is not used: delays come from `/group/<name>/delay`.

## Verified

On 2026-11-08, mihomo v1.19.33:

- `npm run lint`, `npm run check`, `npm test` (22 checks, four feed the generated
  root scripts to `/bin/sh -n`) and `npm run build`.
- Start and stop in both proxy and TUN mode through the extension's own code;
  `/configs` reported `tun.enable: true`, `Meta` carried the resolver settings,
  stopping removed it.
- The TUN start ran twice: through `sudo`, and with `sudo` replaced by a
  refusing stub so the code fell through to `pkexec`. The second run started the
  missing agent, the dialog was answered, and the daemon came up with
  `DNS Servers: 198.18.0.2`, `DNS Domain: ~.`, `-DNSOverTLS`; pid, log and
  generated config were owned by the user again.
- Live groups, provider metadata and per-node delays; selecting the current node
  returned 204; routing toggled `MATCH,PROXY` ↔ `MATCH,DIRECT`.
- `setRouteMode` switched `/configs` to `global` and back to `rule` (204 each,
  read back through `readStatus`); `updateAllProviders` updated the provider;
  `closeAllConnections` returned 204.
- The view rendered stopped and running states without starting a daemon;
  `Enter` on the status row started and stopped TUN.
- The node list rendered the sort dropdown, six `Vless` rows with provider and
  `timeout` / `186 ms` checks; the side panel showed type, provider, last check,
  health and capabilities. Provider nodes are absent from `/proxies` and come
  from `/providers/proxies`.
- `Enter` on the first node moved the group's `now` from `🇺🇸+Атланта` to
  `🇦🇪+Дубай+2`; `PROXY` still pointed at the group.
- `timeout` nodes first was a real bug: a failed check is `0` and sorted as
  fastest. `sortNodes` now treats `0` as unanswered; a check covers it.
- Connections listed a live `speed.cloudflare.com` socket with chain
  `🇩🇪+Франкфурт+3 → VLESS-SELECT → PROXY`, rule `Match`, destination
  `172.66.0.218:443`.
- The log view tailed real lines; the IP view rendered both routes; the provider
  row read `36.1 KB of 20.0 GB` and `until 15 Nov 2026`.
- `Toggle mihomo` started and stopped the daemon.
- `readCore` reported `v1.19.33` with `meta: true` through the controller;
  `testConfig` printed `Configuration is valid`; the geo scan found
  `geoip.metadb`.

Not verified:

- The new Rule/Global/Direct, Update All and Close All actions were exercised
  through the extension's functions, not pressed in the launcher.
- `Update Provider`, `Test Proxy` and the copy/open actions were not pressed.
- The Connections view was not left open long enough to close a socket.
- The pkexec path ran from a shell through the extension's functions, not from a
  Vicinae action; the dialog inside the launcher was not seen.
- A declined dialog (exit 126) and a pkexec timeout were not exercised.
- Two daemons racing for the port, and a crash leaving `Meta` behind, were not
  reproduced.
- Subscription add and QR import are absent: the CLI's `add-sub` writes
  `subscriptions.txt`, which nothing reads.
- The Diagnostics view was exercised through its functions, not rendered.

Measurements and controller shapes: [`docs/audits/miho.md`](../docs/audits/miho.md).
