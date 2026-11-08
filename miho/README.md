# miho

Control the [mihomo](https://github.com/MetaCubeX/mihomo) proxy and TUN tunnel
from Vicinae: start and stop it, switch modes, pick a node, refresh the
subscription, check the egress address and read the log.

It does **not** call `~/bin/others/miho`. Both drive the same daemon and the
same files, so either can take over at any moment:

- `~/.config/mihomo/config.yaml` and the generated `config-tun.yaml`
- `~/.config/miho/state` (`MODE=proxy|tun`), `mihomo.pid`, `mihomo.log`
- the controller on `127.0.0.1:7891` and the mixed proxy on `127.0.0.1:7890`

The extension reads the live process and its config file first, and uses the
state file only when nothing is running. It writes the mode and pid so
`miho status` keeps agreeing with the launcher. Opening the command never starts
a test or a daemon.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `miho` | view | Status, groups, providers and their nodes |
| `Toggle mihomo` | no-view | Starts or stops the daemon in the last used mode |

The status row has Start/Stop, Restart, Switch to TUN/Proxy, Route Direct /
Route Through Proxy, Show Connections, Test Proxy, Check IP, Show Log, Copy
Proxy Address and Open Config. Groups open a node list; Providers has Update
Provider. Selecting a node also points `PROXY` at that group, because the last
rule is `MATCH,PROXY`.

### The views

- **Status** shows the mode, the routing rule, the pid and tags for running,
  TUN, routing and the `Meta` link.
- **Groups** show the group type and the node that is currently selected.
- **Nodes** is a side-panel list: type, provider, capabilities (UDP, TFO,
  MPTCP), the last health check and its verdict for the highlighted node. The
  search-bar dropdown orders by delay, by reachability or by name; a failed
  check is shown as `timeout` and sorts last. The list opens with the delays
  the controller already knows and tests every node again on open.
- **Providers** show the vehicle, node count, traffic against the subscription
  quota, its expiry and when the provider was last updated.
- **Connections** is the live socket list: host, process, rule, proxy chain,
  traffic per connection, and a destructive action to close it. It refreshes
  every two seconds while it is open.
- **Check IP** compares the direct address with the one through the SOCKS
  proxy; **Show Log** tails the log, refreshes every two seconds, can pause and
  opens the file.
- **Toggle mihomo** is a separate no-view command for a single keybinding.

<h2>Prerequisites</h2>

- `mihomo` at `/usr/bin/mihomo`
- a config at `~/.config/mihomo/config.yaml`; the TUN copy is generated from it
  and checked with `mihomo -t` before use
- root access for TUN mode and for stopping a root daemon: either a cached
  `sudo` credential, or polkit with `pkexec` and an authentication agent
  (the extension starts `polkit-gnome-authentication-agent-1` when none runs)
- `ip`, `resolvectl`, `curl` and `pgrep` from the base system

## Authorization

`mihomo` must run as root in TUN mode, and a root daemon needs root to be
signalled and to have its `Meta` link removed. The extension asks in this
order:

1. `sudo -n` — silent, and the only path that never shows a window;
2. `pkexec` — one polkit dialog per action. `org.freedesktop.policykit.exec`
   defaults to `auth_admin` (not `_keep`), so each root action is one script,
   not one prompt per command: a TUN start is a single call that launches the
   daemon, waits for `Meta`, returns ownership of the config directories and
   sets the resolver; a stop is a single call that signals every pid and
   deletes both links.

`pkexec` runs with `--disable-internal-agent`: without it, a launcher with no
controlling terminal falls back to the textual agent and fails with
`No such device or address`.

The `mihoctl` helper is not used: node delays come from the controller's
`/group/<name>/delay`, which answers in under a second.

## Verification

Checked on 2026-11-08 with mihomo v1.19.33:

- `npm run lint`, `npm run check`, `npm test` (20 checks, four of them feed the
  generated root scripts to `/bin/sh -n`) and `npm run build`;
- the real daemon started and stopped in both proxy and TUN mode through the
  extension's own code, `/configs` reported `tun.enable: true`, `Meta` existed
  with its resolver settings, and stopping removed it;
- the TUN start was run twice: once through `sudo` and once with `sudo` replaced
  by a stub that refuses, so the code had to fall through to `pkexec`. In the
  second run it started the missing polkit agent itself, the dialog was
  answered, and the daemon came up with `DNS Servers: 198.18.0.2`,
  `DNS Domain: ~.`, `-DNSOverTLS`, and with the pid, log and generated config
  owned by the user again;
- live groups, provider metadata and per-node delays were read from the
  controller; selecting the current node returned 204; routing toggled
  `MATCH,PROXY` ↔ `MATCH,DIRECT` and back;
- the view rendered the stopped and running states, groups and providers, with
  no daemon started on open; `Enter` on the status row started TUN mode, and
  `Enter` again stopped it;
- the node list rendered `Filter nodes`, the sort dropdown, six nodes with
  `Vless` type, provider, `timeout` / `186 ms`-style checks and a side panel
  with type, provider, last check, health and capabilities; reading
  `/providers/proxies` is what supplies those fields, and the nodes are not in
  `/proxies`;
- `Enter` on the first node changed the group's `now` from
  `🇺🇸+Атланта` to `🇦🇪+Дубай+2`, and `PROXY` still pointed at the group;
- the screenshot showed `timeout` nodes sorted first, which was a real bug:
  the controller reports a failed check as `0`, and `0` sorted as the fastest.
  `sortNodes` now treats `0` as unanswered and a check fails without it;
- the Connections view showed a live `speed.cloudflare.com` socket with its
  chain `🇩🇪+Франкфурт+3 → VLESS-SELECT → PROXY`, rule `Match`, destination
  `172.66.0.218:443` and the close action;
- the log view tailed real daemon lines; the IP view showed the proxy address
  and the direct/through-proxy table; the provider row showed `36.1 KB of
  20.0 GB` and `until 15 Nov 2026`;
- `Enter` on the status row started TUN mode, and `Enter` again stopped it;
- the `Toggle mihomo` command started and stopped the daemon.

Not verified: `Update Provider`, `Test Proxy` and the copy/open actions were
not pressed; the connections view was not left open long enough to watch it
close a socket; the pkexec run was driven through the extension's own code from
a shell, not from a Vicinae action, so the dialog inside the launcher was not
seen; two daemons racing for the port, and an unclean crash leaving `Meta`
behind, were not reproduced; subscription add and QR import are deliberately
absent because the CLI's `add-sub` writes `subscriptions.txt`, which nothing
reads.

The measurements and the interface shapes are in `docs/audits/miho.md`.
