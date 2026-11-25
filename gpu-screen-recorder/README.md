# GPU Screen Recorder

A Vicinae extension for controlling [GPU Screen Recorder](https://git.dec05eba.com/gpu-screen-recorder/).

## Features
- Recording modes: standard screen recording or instant replay (ShadowPlay-like)
- Capture sources: current or specific monitor, or window via the Wayland portal
- Quality presets: Medium, High, Very High, Ultra
- Audio: system audio, the microphone, a specific output or input device, or an
  application — any mix of them at once (PipeWire required)

## Commands
- Start Recording — standard screen recording
- Stop Recording — stop active recording and save
- Toggle Recording — start/stop (mode-aware)
- Start Instant Replay — begin the instant replay buffer
- Stop Instant Replay — stop instant replay mode
- Save Instant Replay — save the buffer to file (Ctrl+S when in instant replay)
## Screenshots
> ![Main Control Panel](assets/main-view-screenshot.png)
> ![Quick Commands](assets/commands-screenshot.png)

## Traps
- The recorder starts detached in its own session; the worker teardown killed it
  while the toast said recording had started — the answer now comes from `pidof`,
  and the output goes to `$TMPDIR/gpu-screen-recorder.log` so a dying start says
  why.
- Window capture is `-w portal`; the portal needs an interactive picker — with no
  app id the Hyprland portal answers `SHAREDATA returned selection -1` and gsr
  fails at once ("desktop portal capture failed"), which is fatal with no window
  on screen: pick a monitor.
- `-a` carries every selected source joined by `|`; `default_output|default_input`
  is the man page's desktop-plus-microphone example, and measured here in 6.1.7.
  One `-a` with both beats two `-a` flags for keeping a predictable argv, and
  the value is single-quoted so an application name cannot expand in the shell.
- Multi-select lives in one `Form.Dropdown`: its value is a synthetic summary
  row whose title lists the picked sources, every real item toggles itself in
  `audioSources` instead of replacing the value, and the picked ones carry a
  check icon. `Form.TagPicker` is not an option: it compiles and emits
  `<tag-picker-field>`, but Vicinae 0.30.1's form deserializer parses that field
  and drops it (`model-deser.cpp`: `[&](FormTagPickerFieldWire &) {}`), so the
  row renders as nothing. `Form.Dropdown` natively holds one value, which is what
  the summary row works around.
- The "after recording" checkboxes are form state, not manifest preferences:
  Vicinae's preferences are read-only at runtime, so a tick written only to
  `useState` looked applied and was `false` again the moment the form closed, and
  the no-view Stop command never saw it. The tick is saved into the same Cache
  blob as the rest of the form, and the no-view commands fall back to the
  manifest preference only when the cache has no value yet.
- Opening the folder goes through `showInFileBrowser(path, { select: true })`:
  the server resolves the XDG default for `inode/directory` (then the FileManager
  category) and reveals the file. The overload without `select` resolves the
  default app on the worker side and throws when no default is registered.
- The save location comes back from `ps -p <pid> -o args=`, which joins the args
  with spaces and drops the quoting: reading one word after `-o` cut every path
  with a space (`…/My Recordings/x.mp4` → `…/My`). The path is the whole tail
  after the last `-o` — measured with 6.1.7 writing `/tmp/opencode/space
  dir/re c.mp4`.

## Tests

`npm test` runs `test/recorder.test.ts` under `tsx`: the pure parsers and the
argv readers against gpu-screen-recorder 6.1.7's own output, captured on this
machine. `src/recorder.ts` imports no `@vicinae/api`, which is what lets the
test load it headless.

## Requirements

- [GPU Screen Recorder](https://git.dec05eba.com/gpu-screen-recorder/)
