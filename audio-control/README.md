# Audio Control

Audio devices, streams and card profiles through `pactl`; works with PipeWire's
pulse server and PulseAudio. Fork of
[`rastsislaux/pulseaudio`](https://github.com/vicinaehq/extensions/tree/main/extensions/pulseaudio),
extended with output groups, presets, a test sound and reconnect.

## Commands

| Command | Does |
| --- | --- |
| Playback | playback streams: volume, mute, device |
| Output Devices | sinks: default, volume, mute, test sound, groups, presets, reconnect; paired Bluetooth devices with state |
| Input Devices | sources: default, volume, mute |
| Recording | recording streams: volume, mute, device |
| Configuration | cards and their active profile |
| Output Presets | apply or delete a saved group and volume |

## Features

- Devices and streams with 5% steps, an exact-volume form (0–150%), mute and
  default switching.
- Output groups combine two or more outputs (`sinks=` on PipeWire, `slaves=` on
  PulseAudio); disbanding moves the default to a surviving member.
- Presets save a row's outputs and volume and reuse an existing group with the
  same members.
- Test sound plays a bundled chime on the selected output.
- Reconnect disconnects and reconnects a Bluetooth output by address; a wired or
  grouped default reasserts itself and pulls streams back.
- Paired Bluetooth devices stay listed when their sink disappears, tagged
  Connected or Not connected.

Inputs are not groupable: `module-combine-source` combines monitor sources and
answers `No such entity` on PipeWire.

## Keys

`Ctrl+M` mute, `Ctrl+D` default, `Ctrl+T` test, `Ctrl+Shift+R` reconnect,
`Ctrl+G` group, `Ctrl+X` disband, `Ctrl+P` apply preset, `Ctrl+S` save preset,
`Ctrl+Up`/`Ctrl+Down` ±5%, `Ctrl+Shift+V` exact volume, `Shift+I` details,
`Ctrl+Enter` apply, `Ctrl+Backspace` delete.

## Requirements

Linux with PipeWire (`pipewire-pulse`) or PulseAudio, `pactl` on `PATH`
(`pulseaudio-utils`), and `bluetoothctl` (`bluez-utils`) for the Bluetooth list
and reconnect.
