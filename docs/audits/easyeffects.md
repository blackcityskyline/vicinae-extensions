# Audit: `easyeffects` ← `omarchy-easyeffects`

[mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects) (MIT) is an
Omarchy bar widget, not a Raycast extension: a `BarWidget.qml` of 265 lines, a 28-line manifest,
a 242-line theme script and a README. It has three jobs:

- show the active output preset, whether effects are bypassed, and the battery of the
  Bluetooth speaker or headphones being played to;
- toggle the global bypass, step through output presets, open Easy Effects;
- optionally recolour Easy Effects from the Omarchy theme and restart it when the theme
  changes.

What was portable is the first two. Everything the widget needs from the bar was replaced by
the launcher's own list or by a second command.

## What maps to what

| Omarchy widget | Here | Why |
| --- | --- | --- |
| bar badge: speaker/headphones icon, preset name, battery %, dimmed while bypassed | `index` list: an Effects row, one row per output preset, an Output row | a launcher has no badge; the list is the surface |
| left click opens Easy Effects | **Open Easy Effects** action, plus **Start in Background** (`--service-mode --hide-window`) | the autostart form the upstream README recommends |
| right click toggles bypass | `Enter` on the Effects row, and the `toggle` no-view command | hotkeys in Vicinae replace the IPC target |
| scroll steps presets | `next` / `previous` no-view commands, and `Enter` on a preset row | scroll cannot be bound to an extension |
| `IpcHandler` `toggle`/`next`/`previous`/`open`/`state` | four commands; `state` is what the list renders | no IPC in Vicinae, launch addresses instead |
| Quickshell `Pipewire.defaultAudioSink` | `pactl get-default-sink` + `pactl --format=json list sinks` | no Quickshell in the launcher |
| Quickshell `Bluetooth.devices`, `battery` | `bluetoothctl info <MAC>` for `Battery Percentage` | BlueZ already answers it; no D-Bus library needed |
| refresh on events + a 60-second fallback | read when the view opens, after every action, and on `cmd+r` | no resident process to notice events; an idle launcher command must not poll |
| 30-second watchdog around a hung CLI call | a 5-second timeout on every call | the CLI quirk is real; see below |
| shared `flock` around CLI calls and theme restarts | **cut** | there is no theme restart and no second writer, so the only race is Easy Effects quitting, which the timeout handles |
| `uwsm-app` launcher | direct `spawn` | Vicinae already runs in the graphical session |
| opt-in theme match (242-line bash) | **cut** | Omarchy-specific: writes a KDE colour scheme, selects it in `easyeffectsrc`, edits `graphrc` and restarts Easy Effects. `omarchy-theme-color` and `~/.local/state/omarchy` are absent here, so it cannot be measured; a one-shot action can be added when an Omarchy machine is available |
| `showBattery`, `showPreset`, `onlyBluetooth`, `lowBattery` settings | **cut** | bar presentation: a list always shows the preset, and the battery when there is one |

The battery is not a separate command: `bluetoothctl` is only asked when the default sink has a
BlueZ address, and a device that does not report a level simply has no accessory. The output
section still appears for analogue sinks.

## The CLI quirk, measured

Upstream documents it and it reproduces on easyeffects 8.3.2: with Easy Effects stopped,
`timeout 3 easyeffects -p` printed the preset list, then stayed alive until the timeout killed
it (exit 124) — the call had become the main instance. The extension therefore checks
`pgrep -x easyeffects` before every call and puts a timeout on each `execFile`. When stopped,
`readState()` answers `running: false` in 69 ms, `loadPreset()` returns false and
`toggleBypass()` returns null without starting anything; `pgrep` afterwards finds no process.

## Measured on this machine, 2026-11-09

- `easyeffects 8.3.2`, `pactl`, `wpctl`, `bluetoothctl`, `hyprctl` and `flock` are installed;
  `omarchy-theme-color` and `uwsm-app` are not, and there is no Omarchy theme state.
- CLI shapes: `-b 3` → `2` (bypass off), `1` after `--bypass-toggle`; `-a output` → `HD272`
  (an empty line when nothing is loaded); `-p` → `Output presets:` / `1\tHD272` / blank /
  `No input presets.` A temporary second preset (`Temporary Test`, a copy of `HD272.json`)
  listed as `2\tTemporary Test`; both it and the file were removed afterwards.
- The port's own `src/api/easyeffects.ts` was driven with `tsx`: it started Easy Effects
  through `openApp(false)`, read `running: true, bypassed: false, preset: "HD272",
  presets: ["HD272", "Temporary Test"]`, toggled the bypass and read it back, and loaded a
  preset. `readOutput()` returned `{ description: "Built-in Audio Analog Stereo" }` — the
  default sink here is analogue, so no BlueZ lookup ran.
- `pactl --format=json list sinks` was captured from this machine; the parser selects the sink
  whose `name` equals `pactl get-default-sink` and reads `api.bluez5.address` from its
  properties. The BlueZ sink-name fallback (`bluez_output.AC_12_2F_3B_4C_5D.1`) is checked in
  the tests.
- BlueZ's battery line was checked against the source that prints it,
  [bluez/client/print.c](https://github.com/bluez/bluez/blob/master/client/print.c):
  `Battery Percentage: 0x%02x (%d)`, e.g. `0x5a (90)`.
- Through launch addresses: `easyeffects:toggle` flipped the bypass from `2` to `1`;
  `easyeffects:next` loaded the temporary second preset and `easyeffects:previous` returned to
  `HD272`, which the CLI confirmed after each command. `easyeffects:index` loaded and started
  with no error after it. The bypass was reset to off and Easy Effects stopped afterwards.
- `npm run lint && npm run check && npm test && npm run build` is clean; the build installs to
  `~/.local/share/vicinae/extensions/easyeffects`.

## Not verified

- No row in the view was pressed by a human. The actions behind them (toggle, load, start) were
  measured through the same functions and through the no-view commands, not through the list.
- No Bluetooth device is connected here: the battery row, the headphone icon and the device
  name from `bluetoothctl` were never drawn. Only the parsers are checked.
- The theme match was not ported, so nothing about its colour output or restart behaviour was
  measured.
- Toasts from the no-view commands were not seen; the state changes they report were.
- The 5-second timeout around a CLI call that became the main instance was not exercised in
  the extension (the quirk itself was measured on the bare CLI). Killing a timeout-wrapped
  `execFile` is the ordinary Node behaviour, but it was not run against a hung Easy Effects.
