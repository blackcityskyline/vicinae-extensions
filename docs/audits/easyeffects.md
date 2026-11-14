# Audit: `easyeffects` ← `omarchy-easyeffects`

[mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects) (MIT) is an
Omarchy bar widget: a 265-line `BarWidget.qml`, a 28-line manifest, a 242-line theme script and a
README. It shows the active output preset, whether effects are bypassed and the battery of the
Bluetooth output, toggles the bypass, steps through presets, opens Easy Effects, and optionally
recolours it from the Omarchy theme.

The first two jobs are portable; everything the widget needs from the bar became the launcher's
own list or a second command.

## What maps to what

| Omarchy widget | Here | Why |
| --- | --- | --- |
| bar badge: icon, preset name, battery %, dimmed while bypassed | `index` list: an Effects row, one row per output preset, an Output row | a launcher has no badge |
| left click opens Easy Effects | **Open Easy Effects**, plus **Start in Background** (`--service-mode --hide-window`) | the autostart form the upstream README recommends |
| right click toggles bypass | `Enter` on the Effects row and the `toggle` no-view command | hotkeys replace the IPC target |
| scroll steps presets | `next` / `previous` no-view commands, `Enter` on a preset row | scroll cannot be bound to an extension |
| `IpcHandler` `toggle`/`next`/`previous`/`open`/`state` | four commands; `state` is what the list renders | no IPC in Vicinae, launch addresses instead |
| Quickshell `Pipewire.defaultAudioSink` | `pactl get-default-sink` + `pactl --format=json list sinks` | no Quickshell in the launcher |
| Quickshell `Bluetooth.devices`, `battery` | `bluetoothctl info <MAC>` for `Battery Percentage` | BlueZ already answers it |
| refresh on events + a 60-second fallback | read on open, after every action, and on `cmd+r` | no resident process to notice events; an idle command must not poll |
| 30-second watchdog around a hung CLI call | a 5-second timeout on every call | the quirk is real; see below |
| shared `flock` around CLI calls and theme restarts | **cut** | no theme restart and no second writer; the timeout covers the one race |
| `uwsm-app` launcher | direct `spawn` | Vicinae already runs in the graphical session |
| opt-in theme match (242-line bash) | **cut** | Omarchy-specific: writes a KDE colour scheme, selects it in `easyeffectsrc`, edits `graphrc`, restarts Easy Effects. `omarchy-theme-color` and `~/.local/state/omarchy` are absent here, so it cannot be measured |
| `showBattery`, `showPreset`, `onlyBluetooth`, `lowBattery` settings | **cut** | bar presentation: a list always shows the preset and the battery when there is one |
| — | **added:** Quit Easy Effects (`-q`) and Force Quit (`pkill -x easyeffects`) | no bar menu; both wait for the process to disappear and report when it did not |

The battery is not a separate command: `bluetoothctl` is asked only when the default sink has a
BlueZ address, and a device that reports no level simply has no accessory. The output section
still appears for analogue sinks.

## The CLI quirk, measured

Reproduces on easyeffects 8.3.2: with Easy Effects stopped, `timeout 3 easyeffects -p` printed the
preset list and then stayed alive until the timeout killed it (exit 124) — the call had become the
main instance. The extension checks `pgrep -x easyeffects` before every call and puts a timeout on
each `execFile`. When stopped, `readState()` answers `running: false` in 69 ms, `loadPreset()`
returns false and `toggleBypass()` returns null without starting anything, and `pgrep` afterwards
finds no process.

## Measured on this machine, 2026-11-09

- `easyeffects 8.3.2`, `pactl`, `wpctl`, `bluetoothctl`, `hyprctl` and `flock` are installed;
  `omarchy-theme-color` and `uwsm-app` are not and there is no Omarchy theme state.
- CLI shapes: `-b 3` → `2` (bypass off), `1` after `--bypass-toggle`; `-a output` → `HD272`
  (an empty line when nothing is loaded); `-p` → `Output presets:` / `1\tHD272` / blank /
  `No input presets.` A temporary second preset (`Temporary Test`, a copy of `HD272.json`)
  listed as `2\tTemporary Test`; both it and the file were removed afterwards.
- The port's `src/api/easyeffects.ts` was driven with `tsx`: `openApp(false)` started Easy Effects,
  `running: true, bypassed: false, preset: "HD272", presets: ["HD272", "Temporary Test"]`, the
  bypass toggled and read back, a preset loaded. `readOutput()` returned
  `{ description: "Built-in Audio Analog Stereo" }` — the default sink is analogue, so no BlueZ
  lookup ran.
- `pactl --format=json list sinks` was captured here; the parser selects the sink whose `name`
  equals `pactl get-default-sink` and reads `api.bluez5.address` from its properties. The BlueZ
  sink-name fallback (`bluez_output.AC_12_2F_3B_4C_5D.1`) is covered by the tests.
- BlueZ's battery line was checked against the source that prints it,
  [bluez/client/print.c](https://github.com/bluez/bluez/blob/master/client/print.c):
  `Battery Percentage: 0x%02x (%d)`, e.g. `0x5a (90)`.
- `quitApp()` was driven against the real app: stopped, it returned true without starting
  anything; after `openApp(true)`, `easyeffects -q` ended it and the wait saw it leave; a second
  start followed by `pkill -x easyeffects` did the same.
- Through launch addresses: `easyeffects:toggle` flipped the bypass from `2` to `1`;
  `easyeffects:next` loaded the temporary preset and `easyeffects:previous` returned to `HD272`,
  confirmed by the CLI after each; `easyeffects:index` loaded and started with no error. The
  bypass was reset and Easy Effects stopped afterwards.
- `npm run lint && npm run check && npm test && npm run build` is clean.

## Not verified

- No row and no shortcut was pressed by a human. The actions behind them (toggle, load, start,
  quit, force quit) were measured through the same functions and the no-view commands, not
  through the list.
- No Bluetooth device is connected here: the battery row, the headphone icon and the device name
  from `bluetoothctl` were never drawn; only the parsers are checked.
- The theme match was not ported, so its colour output and restart behaviour were not measured.
- Toasts from the no-view commands were not seen; the state changes they report were.
- The 5-second timeout was not exercised against a hung Easy Effects; the quirk itself was
  measured on the bare CLI.
