# the miho extension, measured

`~/bin/others/miho` is the owner's 469-line bash script, not a published
extension. It drives the same machine [mihomo](https://github.com/MetaCubeX/mihomo)
that this extension does. Read from that script and its Python helper, then
answered by the live daemon and the real config on **2026-11-08**.

The extension does **not** call the script. Both operate on the same objects and
neither owns a private copy of the state:

| Object | Path |
| --- | --- |
| daemon | `/usr/bin/mihomo` (Mihomo Meta v1.19.33, `with_gvisor`) |
| proxy config | `~/.config/mihomo/config.yaml` |
| generated TUN config | `~/.config/mihomo/config-tun.yaml` |
| HTTP proxy provider | `~/.config/mihomo/providers/vless.yaml` |
| mode ledger | `~/.config/miho/state` (`MODE=proxy` or `MODE=tun`) |
| pid hint | `~/.config/miho/mihomo.pid` |
| log | `~/.config/miho/mihomo.log` |
| mixed proxy | `127.0.0.1:7890` (SOCKS5 + HTTP) |
| external controller | `http://127.0.0.1:7891`, no `secret`, `allow-lan: false` |

The script's state file is a *hint*, not the truth: it can say `MODE=tun` while
nothing runs, and it can be stale after a crash. The live process and its
`-f` argument win. The extension writes the file when it changes the mode so
`miho status` keeps agreeing with the launcher, and reads it only when no
process exists.

## What the script does

| Command | Implementation |
| --- | --- |
| `start` | `nohup mihomo -d <dir> -f config.yaml` in proxy mode; in TUN mode it regenerates `config-tun.yaml`, runs `sudo -b -n sh -c "exec nohup mihomo … > log 2>&1"`, waits for `/version`, writes the pid, `chown`s the config dirs back to the user, waits for the `Meta` link, then sets DNS with `resolvectl` |
| `stop` | SIGTERM the pid (as user, then `sudo -n`), wait 3 s, SIGKILL; delete `Meta` and `tun0`, flush resolver caches, remove the pid file |
| `proxy on\|off` | `sed` the last rule between `MATCH,DIRECT` and `MATCH,PROXY` in `config.yaml`; regenerate the TUN copy when in TUN mode; SIGHUP the daemon |
| `tun on\|off` | write `MODE`, enable routing, stop, start in the new mode |
| `status` | `pgrep -x mihomo`, plus the state file |
| `select` | fzf over `mihoctl`; picks a node, also points `PROXY` at `VLESS-SELECT` |
| `list` | `/providers/proxies` and `/proxies` |
| `ping` | `curl --socks5-hostname 127.0.0.1:7890` to `generate_204` |
| `ip` | direct `ipinfo.io/ip`, then the same through the SOCKS proxy |
| `add-sub` | appends to `subscriptions.txt`; **nothing reads that file** — the provider URL lives in `config.yaml` |

## This machine, measured

`config.yaml` holds `mixed-port: 7890`, `external-controller:
127.0.0.1:7891`, `allow-lan: false`, `mode: rule`, `ipv6: false`, an HTTP
`proxy-provider` named `vless`, three groups (`VLESS-AUTO` url-test,
`VLESS-SELECT` select, `PROXY` select over those two) and rules that end in
`MATCH,PROXY`. No `secret` is set, so the controller needs no token.

Process and mode:

| Probe | Answer |
| --- | --- |
| started directly | `/usr/bin/mihomo -d /home/black/.config/mihomo -f /home/black/.config/mihomo/config.yaml`, owned by `black` |
| started by `miho tun on` | owned by `root`, same argv with `config-tun.yaml` |
| `/proc/<pid>/cmdline` as the user | readable, NUL-separated; the `-f` basename distinguishes the modes |
| `pgrep -x mihomo` | matches the root process too |
| before any start | state file said `MODE=tun`, no process, no `Meta` link |

Controller calls, all answered by v1.19.33 while running:

| Call | Answer |
| --- | --- |
| `GET /version` | `{"meta":true,"version":"v1.19.33"}` |
| `GET /configs` | `mixed-port: 7890`, `mode: rule`, `tun.enable` false in proxy mode and `true` with `device: Meta`, `stack: Mixed` under TUN |
| `GET /proxies` | `GLOBAL`, `PROXY`, `VLESS-AUTO`, `VLESS-SELECT`; selector groups carry `all`, `now` and `testUrl` |
| `PUT /proxies/VLESS-SELECT` with `{"name":"🇩🇪+Франкфурт+3"}` | 204; names must be URL-encoded (`+` becomes `%2B`, or the server reads a space) |
| `GET /group/VLESS-SELECT/delay?url=…&timeout=2000` | map of five nodes to milliseconds, answered in 574 ms; one node unanswered is simply absent |
| `GET /providers/proxies` | `PROXY` and `default` as `Compatible`, `vless` as `HTTP`, six nodes |
| `GET /providers/proxies/vless` | `updatedAt`, six nodes, `alive` per node |
| `PUT /providers/proxies/vless` | 204, and `updatedAt` moved from 03:17 to 04:01 |
| `GET /providers/proxies/vless/healthcheck` | 204 |
| `curl --socks5-hostname 127.0.0.1:7890 https://www.gstatic.com/generate_204` | 204 in 0.41 s |

TUN, measured end to end:

- `miho tun on` produced `Meta 198.18.0.1/30`, `tun.enable: true`,
  `device: Meta`, `stack: Mixed`; `resolvectl status Meta` listed
  `198.18.0.2` as the DNS server with `~.` as the domain and the default route.
- `mihomo -t -d ~/.config/mihomo -f ~/.config/mihomo/config-tun.yaml` printed
  `configuration file … test is successful`.
- `config-tun.yaml` is `config.yaml` with any top-level `tun:` block removed and
  the script's block appended (`enable`, `stack: mixed`, `device: Meta`,
  `auto-route`, `auto-detect-interface`, two `dns-hijack` entries).
- `miho proxy off` while TUN was running rewrote the rule in `config.yaml`,
  regenerated `config-tun.yaml`, SIGHUPed the root process, and the next traffic
  line read `match Match using DIRECT`; `proxy on` restored `MATCH,PROXY`.
- `miho stop` removed `Meta`, left no `tun0`, and `resolvectl status Meta`
  reported `No such device`; no `mihomo` process remained.

Concurrency: neither the script nor the helper takes a lock. Two starts race,
and the second either loses the port or becomes a second daemon; the state file
can name a dead pid. The extension therefore treats every read as fresh (process
+ `/proc` + controller + config file), never caches a pid across renders, and
makes start/stop idempotent: `start` on a running daemon succeeds without
spawning, `stop` on a dead one still cleans the link and pid file.

## What the port carries, and what it cuts

| Script | Here | Why |
| --- | --- | --- |
| `status`, `start`, `stop`, `restart` | one status row with Start/Stop/Restart | the launcher is the panel |
| `proxy on\|off` | "Route Through Proxy" / "Route Direct" | same `sed` + SIGHUP contract |
| `tun on\|off` | "Switch to TUN" / "Switch to Proxy" | stop, regenerate, start, same DNS setup |
| fzf node picker with live pings | a List of nodes, delay accessory, Enter selects | Vicinae's list and filter replace fzf; `/group/…/delay` replaces the Python helper |
| node host/SNI preview parsed from the local subscription | **cut** | it needs the subscription file; the controller already reports type, `alive`, `udp` and delay |
| `P` / `VLESS-SELECT` hardcoding | group list from `/proxies`, selection also points `PROXY` at the chosen group | the helper's `switch` did the same thing for its one group |
| `list` | Groups and Providers sections, detail pane | no terminal output in a launcher |
| `ip` | "Check IP" Detail: direct and through the SOCKS proxy | same two requests |
| `ping` | "Test Proxy" toast with HTTP status and time | same `curl` request |
| `add-sub`, QR import | **cut** | the file it writes is never read; a subscription that does nothing is a lie |
| `need_sudo` password prompt | `sudo -n`, then one `pkexec` dialog per action | a launcher has no terminal to prompt in, and polkit grants are not reused (see below), so the steps of one action are grouped into one script |
| `pings.json` cache | **cut** | the controller's `/group/…/delay` answers in under a second; a file cache would only hide a stale node list |
| `mihoctl`'s duplicate `cmd_servers` (the cached definition shadows the live one) | not reproduced | the extension asks the controller directly |

## What the controller returns, measured

The shapes below were read from the live daemon, not from the docs.

- `/proxies` lists only built-ins, `PROXY`, the providers themselves and the
  groups. The nodes of a group's `all` array are **not** in that map;
  `/providers/proxies/<name>.proxies[]` carries each node's `type`, `udp`,
  `tfo`, `mptcp`, `alive`, `history` and `provider-name`. A list that reads
  `/proxies` alone shows a node with no type and no flags.
- `history[-1].delay` is the last health check the controller ran, so a node
  list can show a delay before it tests anything.
- `/group/<name>/delay` returns a delay per member; a failed check is `0`, not
  an omission. Sorting `0` as a number puts dead nodes first.
- `/proxies/<node>/delay` answers for proxies in `/proxies`, but a provider
  node name is not addressable there (`{"message":"Resource not found"}`), so
  the only per-node test available is the group call.
- `/providers/proxies` carries `subscriptionInfo.upload/download/total/expire`
  (bytes and a Unix expiry), which is the quota the provider row shows.
- `/connections` returns `connections[]` plus `uploadTotal`/`downloadTotal`.
  Each connection has `metadata.host`, `destinationIP`, `destinationPort`,
  `process`, `processPath`, `network`, `destinationGeoIP`, `chains`, `rule`,
  `rulePayload`, `upload`, `download` and `start`. `DELETE /connections/<id>`
  returns 204 and the socket disappears from the next snapshot.

## Root privileges, measured

`/usr/share/polkit-1/actions/org.freedesktop.policykit.policy` sets
`org.freedesktop.policykit.exec` to `auth_admin` for `allow_any`,
`allow_inactive` and `allow_active` — not `auth_admin_keep`. A successful
authentication is therefore not reused, and the next root command asks again.
That is why one user-visible action is one `pkexec` call running one script.

- `pkexec --disable-internal-agent /usr/bin/true` with no agent running: exit
  127, `Error executing command as another user: No authentication agent found.`
- `pkexec /usr/bin/true` with no agent and no terminal: exit 127,
  `Error creating textual authentication agent: Error opening current
  controlling terminal for the process ('/dev/tty'): No such device or address.`
  The `--disable-internal-agent` flag is required, otherwise this is the path a
  launcher takes.
- `/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1` is installed but
  nothing autostarts it in this session. Started by the extension, it registers
  and `pkexec` blocks until the dialog is answered.
- With `sudo` replaced by a stub that answers `sudo: a password is required` on
  stderr, a TUN start went through `pkexec`: the agent was started, the dialog
  answered, and the single script left `Meta` with `DNS Servers: 198.18.0.2`,
  `DNS Domain: ~.` and `-DNSOverTLS`, with `mihomo.log`, `mihomo.pid` and
  `config-tun.yaml` owned by the user and `MODE=tun` written.
- `/etc/sudoers.d/zz-opencode` grants this user `NOPASSWD: ALL`, so on this
  machine `sudo -n` never fails and the pkexec branch is only reached when it
  is refused.

## In the launcher, measured

- Opening the command showed `Stopped · last mode TUN`, `Start mihomo`, and
  started no process.
- `Enter` on the status row started TUN mode: the row read
  `TUN · routed · PID …` with `running`, `TUN` and `Meta link` tags, and the
  Groups and Providers sections appeared.
- `Enter` again stopped it: no process, `Meta` gone, and the row went back to
  `Start mihomo`.
- `Down`, `Enter` opened a group's node list: `Filter nodes`, a
  `VLESS-SELECT Selector · UDP` row, and a `Select Node` action.
- The node list showed the sort dropdown, six rows with `Vless`, the provider
  name, their last checks and a side panel with type, provider, last check,
  health and capabilities. The first draft sorted `timeout` rows to the top
  because a failed check is `0`; that was fixed in `sortNodes` and re-checked.
- `Enter` on the first node moved the group's `now` from `🇺🇸+Атланта` to
  `🇦🇪+Дубай+2` (read back from `/proxies/VLESS-SELECT`) and `PROXY` still
  pointed at `VLESS-SELECT`.
- The Connections view, opened from the status actions, listed a live
  `speed.cloudflare.com` socket with chain
  `🇩🇪+Франкфурт+3 → VLESS-SELECT → PROXY`, rule `Match`, destination
  `172.66.0.218:443`, and the side panel described it.
- The log view tailed the daemon log, and the IP view rendered the proxy
  address and both routes.
- The provider row read `HTTP · 6 nodes · 36.1 KB of 20.0 GB`, `until
  15 Nov 2026`.
- The `Toggle mihomo` command started TUN in about a second and stopped it.

Not verified:

- `Update Provider`, `Test Proxy` and the copy/open actions were not pressed;
  the error panel was not seen; the Connections view was not left open long
  enough to watch it close a socket.
- The pkexec run was driven from a shell through the extension's own functions,
  not from a Vicinae action, so the dialog inside the launcher was not seen; the
  stop script under pkexec was not repeated because the same script had already
  run through `sudo`.
- A declined dialog (exit 126) and a pkexec timeout were not exercised.
- Two daemons racing for the port, and an unclean crash that leaves `Meta`
  behind, were not reproduced.

## Dependencies

`mihomo` itself, `sudo` or polkit (`pkexec` plus an authentication agent) for
the root operations, `ip` and `resolvectl` for the link and DNS, `curl` for the
proxy check and the proxied IP, and `pgrep` for the pid. All are already
required by the script; nothing is installed by the extension.

## License

The script is the owner's own work with no declared license. No line of it is
copied: the state probe, config transform, controller client and views were
written for this repository against the measurements above. The extension is
MIT, like the rest of the repository.
