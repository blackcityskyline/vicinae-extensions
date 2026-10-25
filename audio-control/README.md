<p align="center">
  <img src="assets/command-icon.png" alt="Audio Control icon" width="96" />
</p>

# Audio Control

Audio devices, streams and card profiles for [Vicinae](https://github.com/vicinaehq/vicinae),
through the `pactl` CLI. Works with PulseAudio and PipeWire-Pulse.

A fork of [`rastsislaux/pulseaudio`](https://github.com/vicinaehq/extensions/tree/main/extensions/pulseaudio)
(reproduced in full), extended with output groups, saved presets, a sound test
per output, and reconnect with paired Bluetooth state.

## Features

- **Devices**: output (sinks) and input (sources) lists, default switching,
  mute, 5% volume steps, an exact-volume form with presets, 0–150%.
- **Streams**: playback and recording lists, per-stream volume, mute and a move
  to another device.
- **Cards**: profiles, with the active one marked.
- **Output groups**: combine two or more outputs into one sink and select it.
  Disbanding a group moves the default back to a surviving member. Creation
  follows the server: `sinks=` on PipeWire, `slaves=` on PulseAudio.
- **Test sound**: plays the bundled chime on the selected output, not on
  whatever happens to be default. The chime is generated locally (660 Hz then
  880 Hz, 0.48 s, mono PCM), not copied from the Noctalia plugin.
- **Presets**: save the outputs of the selected row (a group, or one device) and
  its volume, then reapply them from the action panel or the **Output Presets**
  command. A preset reuses an existing group with the same members and creates
  one only when needed.
- **Reconnect**: a Bluetooth output is disconnected and connected again by its
  device address, then selected once the sink reappears; a wired or grouped
  default output reasserts itself and pulls every stream back to it.
- **Paired Bluetooth devices**: a paired device stays in the list after its
  sink disappears, tagged **Connected** or **Not connected**. Connecting one
  brings its sink back and makes it the default.

Inputs are not groupable: `module-combine-source` exists only in classic
PulseAudio, combines *monitor* sources rather than microphones, and answers
`Failure: No such entity` on PipeWire. Faking it with a loopback would not
produce a usable microphone.

## Commands

| Command | Description |
| --- | --- |
| **Playback** | Playback streams: volume, mute, device |
| **Output Devices** | Sinks: default, volume, mute, test sound, groups, presets, output reconnect; paired Bluetooth devices with connection state |
| **Input Devices** | Sources: default, volume, mute |
| **Recording** | Recording streams: volume, mute, device |
| **Configuration** | Cards and their active profile |
| **Output Presets** | Apply or delete a saved output group and volume |

## Shortcuts

Actions are in the row's action panel (`Ctrl+K`). Shortcuts apply to the
selected row.

| Action | Keys |
| --- | --- |
| Mute / unmute | `Ctrl+M` |
| Set as default | `Ctrl+D` |
| Play test sound | `Ctrl+T` |
| Reconnect output | `Ctrl+Shift+R` |
| Group outputs | `Ctrl+G` |
| Disband output group | `Ctrl+X` |
| Apply output preset | `Ctrl+P` |
| Save output preset | `Ctrl+S` |
| Volume +5% / -5% | `Ctrl+Up` / `Ctrl+Down` |
| Set exact volume | `Ctrl+Shift+V` |
| Toggle details | `Shift+I` |
| Apply selected preset | `Ctrl+Enter` |
| Delete preset | `Ctrl+Backspace` |

## Requirements

- Linux with a running PipeWire (`pipewire-pulse`) or PulseAudio server.
- `pactl` in `PATH` (`pulseaudio-utils` on Fedora, `pulseaudio-utils` on
  Debian/Ubuntu, `libpulse` on Arch).
- `bluetoothctl` (`bluez-utils`) for the paired-device list and reconnect.

## Layout

```
src/
  playback.tsx, outputDevices.tsx, inputDevices.tsx, recording.tsx, configuration.tsx,
  outputPresets.tsx
  pactl.ts                 typed pactl client: devices, streams, cards, groups, sample playback
  bluetooth.ts             bluetoothctl device list, disconnect/connect and sink discovery
  api/                     LocalStorage preset store, pactl preset application
  components/              list rows, detail panes, forms, group picker, preset list, paired Bluetooth
  utils/                   pure helpers: device names, volumes, module/preset/Bluetooth parsing
  ui/                      icons, accessories, toasts, formatting
  hooks/                   audio state (one fetch per view) and paired Bluetooth list
test/audio-control.test.ts parsing, shortcuts and Bluetooth list checks against live tools
test/presets.test.ts       preset store parsing and apply planning
```

## Development

```bash
npm install
npm run lint
npm run check
npm test
npm run build   # installs into ~/.local/share/vicinae/extensions/audio-control
```

## License

MIT. Based on `pulseaudio` by Rastsislau Lipski (MIT, Copyright (c) 2025); see
[`LICENSE`](LICENSE), which carries both copyright lines.
