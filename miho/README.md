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
Route Through Proxy, Test Proxy, Check IP, Show Log and Authorize Sudo. Groups
open a node list with a live delay per node; Providers has Update Provider.
Selecting a node also points `PROXY` at that group, because the last rule is
`MATCH,PROXY`.

<h2>Prerequisites</h2>

- `mihomo` at `/usr/bin/mihomo`
- a config at `~/.config/mihomo/config.yaml`; the TUN copy is generated from it
  and checked with `mihomo -t` before use
- `sudo` for TUN mode and for stopping a root daemon. The launcher runs
  `sudo -n` only; if the credential is not cached, use **Authorize Sudo…**,
  which runs `sudo -v` in a terminal
- `ip`, `resolvectl`, `curl` and `pgrep` from the base system

The `mihoctl` helper is not used: node delays come from the controller's
`/group/<name>/delay`, which answers in under a second.

## Verification

Checked on 2026-11-08 with mihomo v1.19.33:

- `npm run lint`, `npm run check`, `npm test` (12 checks) and `npm run build`;
- the real daemon started and stopped in both proxy and TUN mode through the
  extension's own code, `/configs` reported `tun.enable: true`, `Meta` existed
  with its resolver settings, and stopping removed it;
- live groups, provider metadata and per-node delays were read from the
  controller; selecting the current node returned 204; routing toggled
  `MATCH,PROXY` ↔ `MATCH,DIRECT` and back;
- the view rendered the stopped and running states, groups and providers, with
  no daemon started on open; `Enter` on the status row started TUN mode, and
  `Enter` again stopped it;
- the node list rendered `Filter nodes`, the selected group and its type, and
  the `Select Node` action;
- the `Toggle mihomo` command started and stopped the daemon.

Not verified: the `Select Node`, `Test All Nodes`, `Update Provider` and
`Check IP` actions were not pressed; the IP and log views and the error panel
were not seen; a cold sudo credential (no cached `sudo -n`) was not exercised,
so the refusal message is read from the code; two daemons racing for the port,
and an unclean crash leaving `Meta` behind, were not reproduced; subscription
add and QR import are deliberately absent because the CLI's `add-sub` writes
`subscriptions.txt`, which nothing reads.

The measurements and the interface shapes are in `docs/audits/miho.md`.
