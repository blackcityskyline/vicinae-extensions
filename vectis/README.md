# Vectis

A launcher front end for [vectisd](../vectis), the local D-Bus daemon that
manages laptop power: power profiles, a hard TDP cap and GPU mode switching.

Everything goes through the `vectis` CLI, which is vectisd's own client. The
extension does not speak D-Bus itself, so there is no second implementation of
the daemon's contract to keep in step with it.

## Requirements

| Need | Why |
| ---- | --- |
| `vectis` on `PATH` | The CLI the extension shells out to. Normally `/usr/local/bin/vectis`. |
| `vectisd.service` running | Every setting is applied by the daemon, not by the extension. |
| A D-Bus package zone | Without one there is no TDP limit; the extension says so instead of failing vaguely. |
| A PolicyKit policy for `org.vectis.*` | vectisd allows these from your own active graphical session. A locked screen or an SSH session is refused, which the extension reports as a permission problem rather than a crash. |

Build and install vectis first:

```bash
cargo build --release --workspace
sudo install -Dm755 target/release/vectis /usr/local/bin/vectis
sudo systemctl enable --now vectisd
```

## Commands

Five entries. The launcher shows `<command> Vectis`, so the first four are
deliberately named `Set <profile>` and `GPU Mode` rather than something that
would read badly in a list of extensions.

| Entry | Mode | What it does |
| ----- | ---- | ------------ |
| **Vectis** | view | Everything in one list: the three profiles, GPU mode, the TDP cap and diagnostics. |
| **Set Powersave** | no-view | Applies the powersave profile and toasts. No list, no keystroke to confirm. |
| **Set Balanced** | no-view | As above. |
| **Set Performance** | no-view | As above. |
| **GPU Mode** | view | The three GPU modes, with the current and queued one marked. |

The main list is grouped as `Power Profile`, `GPU`, `Power Limit` and
`Diagnostics`, and the active profile and queued GPU mode are shown as row
accessories, so the current state is visible without opening anything.

## GPU switching: two selectors in the search bar

`vectis gpu <mode>` does **not** switch immediately. vectisd records it and
applies it on the next logout or boot, which is the only safe way to change
which GPU drives the display. Applying it now (`--force`) stops the display
manager and kills every application in the session, including the launcher.

Both of those are per-invocation choices rather than per-mode ones, so they sit
in the search bar and stay put while the selection moves down the list:

| Selector | Values | Becomes |
| -------- | ------ | ------- |
| **Driver** | Proprietary (nvidia) / Open source (nouveau) | `--nouveau` for the second |
| **When** | Queue / Now | `--force` for the second |

**When** defaults to *Queue*, the only option that cannot end the session. *Now*
still asks for confirmation, because the selector is easy to leave on by
accident and the cost of being wrong is the entire session. Declining that dialog
queues the switch rather than doing nothing, since that is usually what was
actually wanted.

The driver selector maps onto the two values `GpuDriverPref::from_str` accepts on
the D-Bus side — `auto` and `open` — where `--nouveau` is the CLI's spelling of
`open`. `gpuArgs` drops it for *integrated*, where the daemon would ignore it
anyway, so the selector keeps a fixed shape instead of changing per row.

The two settings are also on the row itself, as shortcuts, so a switch wanted
right now does not need the dropdown reset first:

| Shortcut | Does |
| -------- | ---- |
| `enter` | whatever the selectors say |
| `cmd+shift+f` | switch now, confirming first — the `-f` flag |
| `cmd+n` | queue with the nouveau driver — the `-n` flag |
| `cmd+c` | queue with the selected driver |

### Cancelling a queued switch

A queued switch is state the daemon holds, not one of the three modes, so
cancelling it cannot be an action on a mode row. When `gpu_pending` is set, a
**fourth row** appears — *Cancel Queued Switch to `<mode>`* — and `enter` on it
calls `vectis gpu-cancel`, which was added to the CLI for this.

`gpu-cancel` reports whether anything was actually queued, so the extension can
say *Nothing was queued* rather than always claiming a success.

Cancelling leaves the enforced mode alone. With nothing pending, the daemon
falls through to `enforce_last_gpu_mode`, so the current mode keeps being
re-asserted rather than going ungoverned.

The status view shows the mode vectisd believes is live and marks a queued one.
`vectis gpu-list` is what shows whether a driver is actually bound to the
discrete card, which is how a queued switch that never applied becomes visible.

## TDP

`Set Power Limit` writes straight to `/sys/class/powercap`, independently of the
power profile, so a cap survives switching profiles.

- **PL1** is the sustained limit, **PL2** the short boost limit.
- **Hard lock** sets PL2 equal to PL1, removing the boost window. That happens
  in `TdpLimit::resolve` on the daemon side; the checkbox only carries it.
- Leaving a field empty omits the argument, which is not the same as `0` — `0 W`
  would read to anyone inspecting sysfs afterwards as a deliberate cap.
- `Reset to Hardware Defaults` calls `vectis tdp-clear`.

## Diagnostics

The Status view is everything vectisd reports, plus the raw PCI listing from
`vectis gpu-list`. Both are needed: `status` carries the daemon's view of the
GPU, and `gpu-list` is the only thing that says which card has a driver bound
right now, which is how a queued switch that never applied shows up.

Conflicts are listed when the watch-list has active services. They manage the
same hardware and will fight vectisd.

## Failure messages

vectisd's own error text is classified at the boundary, because the meaning
lives in the wording and a wrong guess sends the user after the wrong problem:

| Situation | What the user is told |
| --------- | --------------------- |
| Daemon not running | `systemctl enable --now vectisd` |
| CLI newer than the daemon | Says so, and how to restart |
| System bus unreachable | Check `dbus.service` |
| PolicyKit refusal | Names the action id, and explains the session rule |
| Unknown profile or GPU mode | The profiles or modes that do exist |
| No RAPL zone | Says the CPU has no package zone, rather than "0 W" |
| TLP overran vectisd's 15 s budget | Names the slow command and where the timeout is set |
| Anything else | The daemon's own words, unedited |

The TLP case is not hypothetical: vectisd gives `tlp <profile>` fifteen seconds
and kills it when it overruns. TLP regenerates udev rules, so it is
occasionally slow enough to trip that, and the setting then silently does not
apply. The message says the setting was not applied, because from the user's
point of view it was not.

## Tests

44 self-checks in `test/vectis.test.ts`, all against the pure layer, so they run
without a daemon or a renderer.

```bash
npm test
```

What is covered, and why:

- **Argument construction.** Every builder is an argv array. A negative or
  fractional watts value is refused before it reaches sysfs, and a value beyond
  `u32` is refused because the D-Bus method takes `u32`.
- **The two GPU selectors**, including that an unrecognised value yields *no*
  options rather than a default: a stored value that is not `force` must never
  turn into `--force`.
- **Parsing.** `status` and `gpu-list` are parsed from payloads captured
  verbatim from this machine. Status returns `null` unless every field is
  present and correctly typed, because a partially parsed status renders as
  though a setting were unset.
- **Failure classification.** Each pattern was copied from output vectisd or
  the CLI actually produced here, including the two different wordings for the
  TLP timeout.
- **Presentation.** A missing RAPL zone must read as `unknown`, not `0W`; a
  queued switch and a failed auto-apply must not be buried.

Two of the checks exist because the code was wrong first: `org.vectis.apply-profile`
is hyphenated, so matching the PolicyKit action id with `\w` truncated it to
`org.vectis.apply`.

## Verification

Run against the live daemon on this machine, not only the compiler:

- All three profiles applied through the real CLI and confirmed via `vectis
  status`; state restored afterwards.
- TDP written to 20/28 W and read back from
  `/sys/class/powercap/intel-rapl:0`, hard lock confirmed to pull PL2 down to
  PL1, `tdp-clear` confirmed to land on the 17 W hardware default, then 25/32 W
  restored.
- GPU mode queued, the pending mode confirmed through `status`, then cancelled;
  the GPU was never actually switched.
- `Set Balanced` was launched as a real Vicinae `no-view` command and the
  profile changed from `performance` to `balanced`, then restored.

**Not verified:** how the lists render. The commands load and start with an
empty stderr, and the `no-view` commands demonstrably work end to end, but the
launcher window would not open from the session this was built in, so the
appearance of every list, form and detail view is unconfirmed. Only a human
looking at the window can close that gap.
