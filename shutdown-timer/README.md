# Shutdown Timer

Arm a power off, reboot or suspend on a countdown you can always cancel, with
warnings before it fires. Port of
[valerkaaa/omarchy-shutdown-timer](https://github.com/valerkaaa/omarchy-shutdown-timer)
(an Omarchy bar widget) to Vicinae.

## How it works

The search bar takes a time — `30` (minutes), `45m`, `2h`, `1h30m`, or a clock
time like `23:30` — and offers the three actions. Arming first asks logind
whether this session may do it (`busctl … CanPowerOff`/`CanReboot`/`CanSuspend`,
read, not guessed), then creates transient systemd user timers
(`systemd-run --user`):

- the action timer runs `systemctl poweroff|reboot|suspend` at the deadline,
  with `AccuracySec=1s` so the countdown is not a lie;
- an early warning (default 5 minutes) and an urgent final warning
  (default 30 seconds) fire `notify-send` before it, unless set to 0;
- `--collect` drops the units after firing, and cancelling stops the timer and
  the service together, then proves they are no longer active.

Armed timers are listed with a live countdown and cancelled individually; the
last 10 outcomes are kept as history. On every open, timers gone from
`systemctl list-timers` are recorded as `ran` (the deadline passed) or
`cancelled` (something outside the extension stopped them).

Nothing leaves the machine: no network, no telemetry. Timers and history live
in Vicinae's `LocalStorage`.

## Preferences

| Preference | Default | Meaning |
| ---------- | ------- | ------- |
| Dry run | off | The action timer sends a notification instead of powering off, to let a timer reach zero safely. |
| Early warning | 5 | Minutes before the action for the first warning; 0 disables it. |
| Final warning | 30 | Seconds before the action for the last, urgent warning; 0 disables it. |

## Prerequisites

systemd with a user session (`systemctl`, `systemd-run`, `busctl` — all from
systemd itself) and `notify-send` from libnotify for the warnings. All four are
resolved from `PATH`; a missing one is reported by name when you arm a timer.

## What the port dropped

Upstream is an Omarchy bar widget: a bash daemon owning the countdown, a QML
popup, a full-screen overlay, and a CLI (read from `master` on 2026-11-04).
Dropped here: the bar widget, popup and overlay (Vicinae renders the UI), the
daemon (transient systemd user timers need no background process), the CLI,
hibernate and lock, repeating schedules, pause/snooze, inhibitor and battery
guards, presets, and i18n (this repo's interface is English). Kept: relative
and clock times, a countdown you can cancel, the early warning, dry run and
history. Unlike upstream, each arm adds its own timer instead of replacing the
previous one.

## Not verified

- A real timer was never watched to zero end to end: arming a power action on
  this machine shuts it down. Command shapes are covered by tests against
  systemd output captured verbatim (systemd 262, 2026-11-03), and the live
  answers of `list-timers`, `busctl CanPowerOff` and `CanSuspend` were checked
  by hand (2026-11-04), but reboot and suspend were not actually run.
- The command loads and starts in Vicinae with an empty stderr log, but its UI
  was not inspected visually by a human.

## Development

```bash
npm install
npm run dev     # hot reload; logs to this terminal
npm run build   # type-check and install
npm test        # self-checks
```

Open it with:

```bash
vicinae 'vicinae://launch/@black/shutdown-timer/timer'
```
