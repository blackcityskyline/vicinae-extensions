# Easy Effects

Output presets, global bypass and the current output's Bluetooth battery, from the launcher.

Port of [mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects)
(MIT), an Omarchy bar widget. The bar itself has no counterpart here, and theme matching was
left out: it is Omarchy-specific, writes Easy Effects' own KDE colour scheme and needs
`omarchy-theme-color`, which is not present on this machine. `docs/audits/easyeffects.md`
records the measurements and the cuts.

## Commands

| Command | What it does |
| --- | --- |
| Easy Effects | The list: effects on/off, output presets, the current output and its battery |
| Toggle Effects | Global bypass for a hotkey: every effect off or back on |
| Next Preset | Load the next output preset, wrapping at the end |
| Previous Preset | Load the previous output preset, wrapping at the start |

Assign hotkeys to the three no-view commands in Vicinae's own shortcut settings; the widget's
Hyprland IPC bindings go through `omarchy-shell`, which does not exist in the launcher.

## Use

The first row says whether the effects are active or bypassed; `Enter` toggles them. If Easy
Effects is stopped, the row says so and `Enter` opens it — either with a window or, with the
second action, in service mode hidden.

The **Output Presets** section lists Easy Effects' own output presets with the active one
marked; `Enter` loads one. The **Output** section names the default sink and, when it is a
Bluetooth device that reports a battery, shows the level. `Refresh` (`cmd+r`) rereads
everything.

State is read when the window opens and after every action. There is no timer and no
background polling: a launcher command does not live long enough to watch for changes, and an
idle command should not spin.

## Easy Effects' stop/start quirk

A CLI call made while Easy Effects is stopped does not fail: it becomes the main instance and
never exits. Every call here first checks `pgrep -x easyeffects`, and every call has a
five-second timeout, so a race with Easy Effects quitting cannot leave the launcher hanging or
leave a stray instance behind.

## Requirements

- Easy Effects with the `easyeffects` CLI in `PATH`. The presets and bypass need it running;
  the view can start it.
- `pactl` for the output device, and `bluetoothctl` for a Bluetooth battery. Without them the
  list still works, with less in the Output section.

## Not verified

- The view was loaded and its actions were exercised through the no-view commands and the
  CLI, but no row was pressed by a human: loading a preset from the list, starting Easy
  Effects from it and watching the row change.
- No Bluetooth device is connected to this machine, so the battery row was never drawn. The
  parser is checked against BlueZ's own output format, and the sink detection against a real
  `pactl --format=json` reply.
- Only one preset exists here; a second, temporary one was used to check the next/previous
  commands and the list parser, then removed.
