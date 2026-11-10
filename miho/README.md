# Miho

Control [mihomo](https://github.com/MetaCubeX/mihomo) from Vicinae: proxy and TUN
modes, node selection, provider refresh, subscriptions, live traffic, rules,
connections, egress IP and the log.

The extension never calls `~/bin/others/miho`. Both drive the same objects, so
either can take over at any moment:

| Object | Path |
| --- | --- |
| proxy config | `~/.config/mihomo/config.yaml` |
| generated TUN config | `~/.config/mihomo/config-tun.yaml` |
| provider cache | `~/.config/mihomo/providers/<name>.yaml` |
| config profiles | `~/.config/mihomo/profiles/<name>.yaml` |
| mode ledger | `~/.config/miho/state` (`MODE=proxy\|tun`) |
| system-proxy ledger | `~/.config/miho/system-proxy` (Hyprland instance signature) |
| pid hint and log | `~/.config/miho/mihomo.pid`, `mihomo.log` |
| node favorites | Vicinae `LocalStorage`, key `miho.favorites` |
| controller, mixed proxy | `127.0.0.1:9090`, `127.0.0.1:7890` |

The live process and its `-f` argument are the truth; the state file is read only
when nothing runs and written on every mode change so `miho status` agrees with
the launcher. Opening the command starts neither a test nor a daemon.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `miho` | view | Status, groups, nodes, providers, connections, IP and log |
| `Toggle mihomo` | no-view | Starts or stops the daemon in the last used mode |
| `Rules` | view | Effective routing rules and their hit counts |
| `Profiles` | view | Saves the current config and switches between snapshots |

### Views and actions

| View | Shows | Actions |
| --- | --- | --- |
| Status | mode, mihomo mode, routing rule, pid, live ↓/↑ rate, tags for running, TUN, routing, system proxy and `Meta` | Start/Stop, Restart, Switch TUN/Proxy, Rule/Global/Direct mode, Route Direct/Through Proxy, Enable/Disable System Proxy, Show Connections, Test Proxy, Check IP, Show Log, Add Subscription, Diagnostics, Copy Proxy Address, Open Config |
| Groups | type and selected node, including `GLOBAL` | Open Nodes |
| Nodes | side panel: type, provider, capabilities, last check, health; star on favorites | Select Node, Add/Remove Favorites, Test All Nodes, Copy Node Name |
| Providers | vehicle, node count, auto-update interval, quota, expiry, last update | Update Provider, Update All Providers, Add/Edit/Remove Subscription, Copy Provider Name |
| Connections | host, process, rule, chain, per-socket traffic | Close Connection, Close All Connections, Copy Host/Destination/Chain, Refresh |
| Check IP | direct address and address through the SOCKS proxy | Check Again, Copy |
| Log | tail of `mihomo.log` | Refresh, Pause, Copy Log, Open Log File |
| Diagnostics | core version and build, controller reachability, config paths, geo files, config test | Test Config, Copy Core Version, Open Config/TUN Config, Show Log, Refresh |
| Rules | type, payload, outbound, disabled state, hit count and last hit, in evaluation order | Copy Rule/Payload/Outbound, Refresh |
| Profiles | saved snapshots, with `active` on the one that matches `config.yaml` | Apply Profile, Save Current as Profile, Delete Profile, Copy Profile Name, Open Profile, Refresh |

The node list's search-bar dropdown orders by delay, favorites, reachability or
name. A failed check reads `timeout` and sorts last; the list opens with the
delays the controller already measured, then tests every node again. Selecting a
node also points `PROXY` at that group, because the last rule is `MATCH,PROXY`.
Favorites are node names in `LocalStorage`; they survive restarts and a corrupt
value is ignored rather than clearing the pins.

## System proxy

`hyprctl setenv` is the only live way into a Hyprland session: new GUI
applications and terminals inherit the variables, already running ones do not.
The toggle sets `http_proxy`, `https_proxy`, `all_proxy` (SOCKS on the same mixed
port) and `no_proxy`, and clears them when the daemon stops or routing goes
direct. `~/.config/miho/system-proxy` stores the compositor signature, so a
compositor restart reads as "off" instead of leaking a stale toggle.

A failed start, stop, restart or TUN authorization also raises a `notify-send`
notification, because a toast is gone once the launcher closes.

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

## Subscriptions

Add, edit and remove HTTP subscriptions in `config.yaml`. A new provider is
inserted under `proxy-providers:` and joins every group that already has a
`use:` list; editing changes the URL and the auto-update interval; removing drops
the block, the group references and the cached `providers/<name>.yaml`. Each edit
is written to `config.pending.yaml`, checked with `mihomo -t`, and only then
replaces the live file, with the TUN copy regenerated when that is the running
mode; the daemon is reloaded with `SIGHUP`. A rejected edit leaves `config.yaml`
untouched and is reported as a toast.

The CLI's `add-sub` still writes `subscriptions.txt`, which neither tool reads.

## Profiles

A profile is a full copy of `config.yaml` in `~/.config/mihomo/profiles/<name>.yaml`;
a profile is marked `active` when it is byte-identical to the live config. Applying
one runs the same path as a subscription edit: staged file, `mihomo -t`, then the
replacement and a `SIGHUP`, with the TUN copy regenerated when that is the running
mode. Saving the current config is how a working layout is kept before
experimenting. Deleting a profile removes only the snapshot.

## Verified

On 2026-11-08, mihomo v1.19.33:

- `npm run lint`, `npm run check`, `npm test` (35 checks, four feed the generated
  root scripts to `/bin/sh -n`) and `npm run build`.
- Start and stop in both proxy and TUN mode through the extension's own code;
  `/configs` reported `tun.enable: true`, `Meta` carried the resolver settings,
  stopping removed it.
- `proxy → TUN → proxy → stopped` through `setMode` and `readStatus` flipped the
  status each time; a stopped daemon was gone from `ps` and `Meta` was deleted.
- A stopped daemon can linger as `[mihomo] <defunct>` under a parent that never
  reaps it. `pgrep` and `kill(pid, 0)` both still saw it, so status said running
  and a TUN start answered "mihomo is already running". Zombies are now rejected
  through `/proc/<pid>/stat`, and spawned children stay referenced so libuv reaps
  them; a fresh start and stop left no zombie.
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
- `readRules` returned the six configured rules in order, from
  `IPCIDR 127.0.0.0/8 → DIRECT` to `Match → PROXY`, with hit counters.
- `watchTraffic` received `{up, down, upTotal, downTotal}` from
  `ws://127.0.0.1:9090/traffic`; the view closes the socket on unmount.
- Favorites round-trip through `LocalStorage` was not exercised in Vicinae; the
  parse and toggle rules are covered by checks.
- `setSystemProxy(true/false)` and `clearSystemProxy` round-tripped through the
  live Hyprland socket; the ledger file appeared and disappeared. `notifyFailure`
  ran `notify-send` once.
- A second subscription (`vless-copy`, same URL) was added, its interval changed
  from 3600 to 7200, and removed through the extension's functions. Every step
  passed `mihomo -t` and reloaded the daemon; `config.yaml` was byte-identical
  before and after, and the cached provider file was gone.
- A profile `tmpcheck` was saved from the live config, `config.yaml` was then
  overwritten by hand, and `applyProfile` put it back through `mihomo -t`;
  `readProfiles` reported `active` only when the bytes matched. Saving a
  duplicate name and deleting an absent name were refused; `config.yaml` ended
  byte-identical to the start and no profile file or `*.pending.yaml` was left.

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
- The zombie fix was exercised through the extension's functions in a shell, not
  by pressing Stop in the launcher.
- The subscription form was exercised through the API, not rendered or submitted.
- QR import is absent; a subscription URL is typed or pasted.
- The Diagnostics view was exercised through its functions, not rendered.
- The `Rules` command was exercised through `readRules`, not rendered or searched.
- The `Profiles` command was exercised through its functions, not rendered.
- The live-rate accessories were fed by a real `/traffic` sample, not seen in the
  launcher.
- System-proxy auto-clear on stop and on routing-off was not exercised end to
  end; only `clearSystemProxy` itself was.

Measurements and controller shapes: [`docs/audits/miho.md`](../docs/audits/miho.md).
