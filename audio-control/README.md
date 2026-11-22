# Audio Control

Audio devices, streams and card profiles through `pactl` — PipeWire's pulse
server or PulseAudio. Fork of [`rastsislaux/pulseaudio`](...), extended with
groups, presets, test sound and reconnect.

## Commands

| Command | Does |
| --- | --- |
| Playback | playback streams: volume, mute, device |
| Output Devices | sinks: default, volume, mute, test sound, move playing streams onto it, groups, presets, reconnect; paired Bluetooth devices with state |
| Input Devices | sources: default, volume, mute |
| Recording | recording streams: volume, mute, device |
| Configuration | cards and their active profile |
| Output Presets | apply or delete a saved group and volume |

## Features

- Devices and streams with 5% steps, an exact-volume form (0–150%), mute and
  default switching.
- Output groups combine outputs (`sinks=` PipeWire, `slaves=` PulseAudio);
  disbanding moves the default to a surviving member. Presets save a row's
  outputs and volume, reusing an existing group with the same members.
- Test sound plays a bundled chime on the selected output.
- Reconnect: a Bluetooth output by address; a wired or grouped default
  reasserts itself and pulls streams back.
- Setting a default affects only streams started afterwards. **Move a Stream
  Here…** moves one playing stream onto the row's sink; **Move All Streams
  Here** moves every one. On a group, the streams land in the group.
- Paired Bluetooth devices stay listed when their sink disappears, tagged
  Connected or Not connected.

Inputs are not groupable: `module-combine-source` combines monitor sources and
answers `No such entity` on PipeWire.

## Keys

`Ctrl+M` mute, `Ctrl+D` default, `Ctrl+T` test, `Ctrl+Shift+M` move a stream,
`Ctrl+Shift+A` move all streams, `Ctrl+Shift+R` reconnect,
`Ctrl+G` group, `Ctrl+X` disband, `Ctrl+P` apply preset, `Ctrl+S` save preset,
`Ctrl+Up`/`Ctrl+Down` ±5%, `Ctrl+Shift+V` exact volume, `Shift+I` details,
`Ctrl+Enter` apply, `Ctrl+Backspace` delete.

## Requirements

Linux with PipeWire (`pipewire-pulse`) or PulseAudio, `pactl` on `PATH`
(`pulseaudio-utils`); `bluetoothctl` (`bluez-utils`) for the Bluetooth list and
reconnect.
