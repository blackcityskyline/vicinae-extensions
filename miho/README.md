# Miho

Control [mihomo](https://github.com/MetaCubeX/mihomo) from Vicinae: proxy and TUN
modes, node selection, providers, subscriptions, profiles, live traffic, rules,
connections, egress IP and the log.

The extension never calls `~/bin/others/miho`; both drive the same files
(`~/.config/mihomo/config.yaml`, the generated `config-tun.yaml`, the provider
and profile caches) and the same controller on `127.0.0.1:9090`. The live
process and its `-f` argument are the truth; the mode ledger
`~/.config/miho/state` is read only when nothing runs and written on every mode
change.

## Commands

| Command | Mode | Does |
| --- | --- | --- |
| `miho` | view | Status, groups, nodes, providers, connections, IP, log |
| `Toggle mihomo` | no-view | Starts or stops the daemon in the last used mode |
| `Rules` | view | Effective rules in order, with hit counts |
| `Profiles` | view | Saves the config and switches between snapshots |

Status carries start/stop, restart, TUN/proxy, rule/global/direct, direct or
proxied routing, system proxy, connections, test proxy, check IP, log,
subscription and profile actions. Nodes sort by delay, favorites, reachability
or name; a failed check reads `timeout` and sorts last. Favorites are node names
in `LocalStorage`.

## System proxy

`hyprctl setenv` is the only live way into a Hyprland session: new applications
and terminals inherit `http_proxy`, `https_proxy`, `all_proxy` and `no_proxy`;
running ones do not. A failed start, stop, restart or TUN authorization also
raises `notify-send`, because a toast disappears with the launcher.

## Requirements

- `mihomo` at `/usr/bin/mihomo`, and `~/.config/mihomo/config.yaml`; the TUN copy
  is generated and checked with `mihomo -t`.
- root for TUN: `sudo -n` first, then `pkexec` (one polkit dialog per action,
  `--disable-internal-agent`). A missing agent is started by the extension.
- `ip`, `resolvectl`, `curl`, `pgrep`.

## Subscriptions and profiles

Edits are written to `config.pending.yaml`, checked with `mihomo -t`, then
replace the live file and reload the daemon with `SIGHUP`; the TUN copy is
regenerated when that is the running mode. A rejected edit leaves `config.yaml`
untouched. A profile is a byte copy in `~/.config/mihomo/profiles/<name>.yaml`,
`active` when it matches the live config, applied through the same staged path.

## Verified live

Start/stop in both modes, `proxy → TUN → proxy`, subscriptions added, edited and
removed, profiles saved and applied, node selection, routing mode changes,
connections, rules, log, IP and the traffic socket, all against mihomo v1.19.33.
Not pressed in the launcher: the subscription form, Diagnostics, Profiles and
Rules views, Update All, Close All, Test Proxy, the copy actions, and the pkexec
dialog inside a window.

Measurements and controller shapes: [`docs/audits/miho.md`](../docs/audits/miho.md).
