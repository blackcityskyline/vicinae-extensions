# audio-control

Fork of the Vicinae `pulseaudio` extension, plus three features taken from a
Noctalia bar plugin. Measured on PipeWire 1.6.9 (pipewire-pulse), 2026-10-23.

| Piece | Source |
| --- | --- |
| Commands, `pactl` client, list rows, forms | [`vicinaehq/extensions` › `extensions/pulseaudio`](https://github.com/vicinaehq/extensions/tree/main/extensions/pulseaudio), MIT, by Rastsislau Lipski |
| Output grouping, test sound, Bluetooth reconnect | `noctalia-koyaa-plugins/audio-switcher-plus` (Noctalia plugin API 15), MIT, by blackbartblues |

The Vicinae extension was copied as a whole; nothing from it was dropped. Its
five commands are unchanged in behaviour.

## Upstream defects fixed here

| Defect | Effect |
| --- | --- |
| `StreamItem` called `useAudioState()` per row | every playback/recording row ran seven `pactl` calls; rows now receive devices from their list |
| `shortcuts.ts` imported `@vicinae/api/dist` | deep import into the bundle; replaced with the public `@vicinae/api` import |
| `Keyboard.Shortcut.Common.Refresh as Keyboard.Shortcut.Common` | invalid cast, rejected by `tsc`; cast dropped |
| `LoadingError` carried a bare `actions` prop | meaningless JSX attribute; removed |
| No `List.EmptyView` for an empty device list | silence looked like a crash; both device commands now name the next action |

## Output grouping

`pactl load-module module-combine-sink` creates a new sink from existing sinks.
The module argument differs by server, and `pactl info` is the discriminator:

- PipeWire: `sinks=a,b` (`Server Name: PulseAudio (on PipeWire 1.6.9)`).
- Classic PulseAudio: `slaves=a,b`.

`pactl` returns the module index on stdout. That index is the only handle for
`unload-module`, and it is **not** in JSON:

```
pactl -f json list modules   # entries have name, argument, properties — no index
pactl list short modules     # 536870917<TAB>module-combine-sink<TAB>sink_name=…
```

So `outputGroups` is parsed from `list short modules`, not from the JSON used by
the rest of the client. The generated sink name is
`audio_control_group_<epoch>_<counter>`; membership is read back from the
module argument, which also means groups created by other tools are recognised
and can be disbanded.

`sink_properties=device.description=Audio Control Group` cannot be used: `pactl`
joins argv with spaces, the module parses by spaces, and the sink description
becomes `Audio`. The group row is therefore titled from its member names, not
from the sink description. Sink names are unique by construction.

Creating a group does not move existing streams. The group is made default and
every sink input is moved explicitly. `move-sink-input` on an index that
disappeared between `list` and the move fails with `Invalid argument`; a
notification or a closing player does that, so per-stream failures are tolerated
and the move continues. Verified by moving a 30 s `pw-play` stream into a group:
the stream landed on the group sink.

Disbanding: if the group is default, the first surviving member becomes default
and receives the streams **before** `unload-module`, otherwise streams pinned to
the group would be destroyed with it.

### Input grouping does not exist

`pactl load-module module-combine-source` answers `Failure: No such entity` on
this PipeWire server. Even where it exists, PulseAudio's `module-combine-source`
combines **monitor** sources, not microphones, and the extension's source list
filters monitors out (`isAudioSource`). There is no honest input-group feature
to add through `pactl`; the README says so instead of shipping a no-op.

## Test sound

`play-sample` takes a sink argument and works on both servers; `pw-play` would
tie the feature to PipeWire and would need its own dependency check.
`upload-sample` overwrites an existing name, so the sequence is idempotent:

```
pactl upload-sample <assets>/test-sound.wav audio-control-test
pactl play-sample audio-control-test <sink-name>
```

Both verified live against a combined sink; the sample stayed loaded (a few tens
of KB) and no removal is needed. The asset is a generated two-tone chime (42 KB
mono PCM), not the plugin's 1 MB WAV.

## Bluetooth reconnect

The sink carries the address as `api.bluez5.address`; the fallback parses
`bluez_output.1C_52_16_B4_7F_F7.1` → `1C:52:16:B4:7F:F7`. Reconnect is:

1. `bluetoothctl disconnect <addr>` — a failure means "already disconnected",
   ignored.
2. `bluetoothctl connect <addr>` — output containing `Failed to connect` is an
   error even when the exit code is 0.
3. Poll `pactl list sinks` 20 × 250 ms for the address, then set it default and
   move streams.

Error path verified with `00:00:00:00:00:00`: `Could not connect … Device …
not available`, no unhandled rejection. **Not verified against real headphones**
— no Bluetooth device was connected during the session.

## Checks

`test/audio-control.test.ts` — 13 checks, 1 live. Covered: combine-module
parsing (`sinks=` and `slaves=`), argument construction, group-name shape,
ungroup fallback (first surviving member, `undefined` when none), Bluetooth
address from property and from name, wired sinks yielding no address,
PipeWire/classic server detection. The live check runs `pactl info` and skips if
the server is unreachable.

Live backend checks run by hand, not in `npm test` because they mutate routing:

- create a group of `alsa_output…` + a temporary `module-null-sink`;
- parse it back through `fetchAudioState().outputGroups`;
- set default, move a real stream, play the sample;
- unload, restore the original default, remove the null sink.
