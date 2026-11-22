# Miho

Control [mihomo](https://github.com/MetaCubeX/mihomo) from Vicinae: proxy and TUN
modes, node selection, providers, subscriptions, profiles, live traffic, rules,
connections, egress IP and the log.

The extension drives the same files (`~/.config/mihomo/config.yaml`, the
generated `config-tun.yaml`, the provider and profile caches) and the same
controller on `127.0.0.1:9090`; the live process and its `-f` argument are the
truth. The mode ledger `~/.config/miho/state` is read only when nothing runs,
written on every mode change.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `miho` | view | Status, groups, nodes, providers, connections, IP, log |
| `Toggle mihomo` | no-view | Starts or stops the daemon in the last used mode |
| `Rules` | view | Effective rules in order, with hit counts |
| `Profiles` | view | Saves the config and switches between snapshots |
| `Traffic` | view | Live traffic per process and per connection |

Status carries start/stop, restart, TUN/proxy, rule/global/direct, direct or
proxied routing, system proxy, connections, test proxy, check IP, log,
subscription and profile actions. Nodes sort by delay, favorites, reachability
or name; a failed check reads `timeout` and sorts last. Favorites are node names
in `LocalStorage`.

## Live traffic

`Traffic`, and `Live Traffic` in the status panel, polls `/connections` once a
second: one row per process and one per connection, each with the current ↓ and
↑, where it goes and whether it goes `direct` or through the `proxy`; a process
with both kinds of connection reads `mixed`. Both sections carry their session
totals, and closing one or all connections is an action.

The controller's counters are cumulative and flush in bursts; a rate is the
bytes of the last burst over the time since the previous one, held unchanged
until the next burst and for at most 10 s: a stopped connection falls to zero.
Measured on v1.19.34: bursts 4–7 s apart, so a one-second delta reads zero
most ticks.

Process names come from the controller only with `find-process-mode: always`;
without it every row reads `unknown process`. "Enable Process Names" writes that
key through the staged, checked config path and reloads the daemon with `SIGHUP`.

## System proxy

`hyprctl setenv` is the only live way into a Hyprland session: new apps and
terminals inherit `http_proxy` etc.; running ones do not. A failed
start/stop/restart/TUN auth also raises `notify-send` — a toast disappears with
the launcher.

## Requirements

- `mihomo` at `/usr/bin/mihomo`; `~/.config/mihomo/config.yaml`; the TUN copy is
  generated and checked with `mihomo -t`.
- root for TUN: `sudo -n` first, then `pkexec` (one polkit dialog per action,
  `--disable-internal-agent`); a missing agent is started by the extension.
- `ip`, `resolvectl`, `curl`, `pgrep`.

## Subscriptions and profiles

Edits are written to `config.pending.yaml`, checked with `mihomo -t`, then
replace the live file and reload the daemon with `SIGHUP`; the TUN copy is
regenerated when that is the running mode. A rejected edit leaves `config.yaml`
untouched. A profile is a byte copy in `~/.config/mihomo/profiles/<name>.yaml`,
`active` when it matches the live config, applied through the same staged path.

## Verified live (mihomo v1.19.33/34)

Start/stop both modes, `proxy → TUN → proxy`, subscriptions added/edited/
removed, profiles saved/applied, node selection, routing changes, connections,
rules, log, IP, traffic socket. Live traffic: process names with
`find-process-mode: always`, `direct` vs `proxy` rows, rates matched
`curl --limit-rate 150k`; "Enable Process Names" wrote the key and reloaded the
daemon. Not pressed: subscription form, Diagnostics, Profiles/Rules views,
Update All, Close All, Test Proxy, copy actions, connection close, the pkexec
dialog inside a window.
