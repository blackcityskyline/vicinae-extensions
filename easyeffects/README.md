# Easy Effects

Output presets, global bypass and the current output's Bluetooth battery, from
the launcher. Port of
[mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects)
(MIT), an Omarchy bar widget; the bar and the Omarchy theme matching are not
carried over.

## Commands

| Command | Does |
| --- | --- |
| Easy Effects | effects on/off, output presets, the current output and its battery |
| Toggle Effects | global bypass for a hotkey |
| Next Preset / Previous Preset | load the next or previous output preset, wrapping |

The first row says whether effects are active or bypassed; Enter toggles. A
stopped Easy Effects is opened by Enter, with a window or in service mode. The
presets section loads one on Enter, and the Output section names the default sink
with its Bluetooth battery. While it runs, the panel offers **Quit Easy Effects**
and **Force Quit**, both guarded by `pgrep` so they cannot start an instance.

## Keys

`ctrl+t` toggle, `ctrl+l` load preset, `ctrl+o` open, `ctrl+shift+b` start in
background, `ctrl+r` refresh, `ctrl+x` quit, `ctrl+q` force quit. The three
`no-view` commands get their hotkeys from Vicinae's shortcut settings.

## Quirk

A CLI call made while Easy Effects is stopped becomes the main instance and never
exits. Every call first checks `pgrep -x easyeffects` and has a five-second
timeout, so the launcher cannot hang or leave a stray process.

## Requirements

Easy Effects with the `easyeffects` CLI on `PATH`, `pactl` for the output and
`bluetoothctl` for a battery. Without the last two the list still works with less
in the Output section.

State is read on open and after every action; there is no timer or polling.

## Not verified

No row was pressed by a human: loading a preset from the list and watching the
row change are untested. No Bluetooth device is connected here, so the battery
row was never drawn; its parser is checked against BlueZ's format. Only one
preset exists, so a temporary second one covered next/previous.
