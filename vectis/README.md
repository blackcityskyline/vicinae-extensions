# Vectis

A launcher front end for [vectisd](../vectis), the local D-Bus daemon that manages
laptop power: power profiles, a hard TDP cap and GPU mode switching.

Everything goes through the `vectis` CLI, vectisd's own client, so the
extension does not speak D-Bus itself.

## Requirements

- `vectis` on `PATH` (normally `/usr/local/bin/vectis`) and `vectisd.service`
  running.
- A D-Bus powercap zone, otherwise there is no TDP limit and the extension says
  so.
- A PolicyKit policy for `org.vectis.*`, which vectisd allows from your own
  graphical session; a locked screen or SSH is refused.

```bash
cargo build --release --workspace
sudo install -Dm755 target/release/vectis /usr/local/bin/vectis
sudo systemctl enable --now vectisd
```

## Commands

| Entry | Mode | Does |
| --- | --- | --- |
| Vectis | view | Profiles, GPU mode, TDP and diagnostics in one list |
| Set Powersave / Balanced / Performance | no-view | Applies the profile and toasts |
| GPU Mode | view | The three GPU modes, current and queued marked |

## GPU switching

`vectis gpu <mode>` queues the switch for the next logout or boot; `--force`
stops the display manager and ends the session. Two search-bar selectors pick
**Driver** (Proprietary or Open source, `--nouveau`) and **When** (Queue or Now,
`--force`); Now asks first, and declining queues instead. Shortcuts on a row:
`enter` as selected, `cmd+shift+f` switch now, `cmd+n` queue with nouveau,
`cmd+c` queue with the selected driver.

A queued switch adds a **Cancel Queued Switch** row calling `vectis gpu-cancel`,
which reports whether anything was queued. Cancelling leaves the enforced mode
alone.

## TDP

`Set Power Limit` writes to `/sys/class/powercap` independently of the profile.
PL1 is sustained, PL2 the boost; **Hard lock** sets them equal. An empty field
omits the argument rather than sending `0`. `Reset to Hardware Defaults` calls
`vectis tdp-clear`.

## Errors

vectisd's text is classified at the boundary: daemon down, CLI newer than the
daemon, bus unreachable, PolicyKit refusal, unknown profile or mode, no RAPL
zone, TLP overrunning its 15-second budget. Anything else is passed through.

## Verified

The three profiles, TDP writes and clearing, GPU mode queued and cancelled, and
the `no-view` commands were run against the live daemon. The list, form and
detail views were not seen: the launcher window would not open from that
session.
