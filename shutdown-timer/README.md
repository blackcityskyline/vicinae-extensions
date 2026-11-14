# Shutdown Timer

Arm a power off, reboot or suspend on a countdown you can always cancel, with
warnings before it fires. Port of
[valerkaaa/omarchy-shutdown-timer](https://github.com/valerkaaa/omarchy-shutdown-timer)
(an Omarchy bar widget), MIT.

## How it works

The search bar takes `30` (minutes), `45m`, `2h`, `1h30m` or a clock time like
`23:30`, and offers power off, reboot and suspend. Arming asks logind whether the
session may do it (`busctl … CanPowerOff`/`CanReboot`/`CanSuspend`) and then
creates transient systemd user timers with `AccuracySec=1s`, plus an early
warning (5 minutes) and a final urgent one (30 seconds), either set to 0 to
disable. Cancelling stops the timer and its service and checks they are gone;
`--collect` drops the units after firing.

Armed timers are listed with a live countdown. On each open, timers missing from
`systemctl list-timers` are recorded as `ran` or `cancelled`, and the last 10
outcomes are kept as history. Timers and history live in `LocalStorage`; nothing
leaves the machine.

## Preferences

| Preference | Default | Meaning |
| --- | --- | --- |
| Dry run | off | notify instead of powering off, so a timer can reach zero safely |
| Early warning | 5 | minutes before; 0 disables |
| Final warning | 30 | seconds before; 0 disables |

## Requirements

systemd with a user session (`systemctl`, `systemd-run`, `busctl`) and
`notify-send`; a missing one is named when arming.

## Dropped from upstream

The bar widget, popup, overlay, bash daemon and CLI; hibernate and lock;
repeating schedules, pause/snooze, inhibitor and battery guards; presets; i18n.
Kept: relative and clock times, a cancellable countdown, early warning, dry run
and history. Each arm adds its own timer instead of replacing the previous one.

## Not verified

No real timer was watched to zero (arming a power action would shut the machine
down); the command shapes are tested against captured systemd output, and
`list-timers` and the `CanPowerOff`/`CanSuspend` answers were read live. The UI
was not inspected by a human.
