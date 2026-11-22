# GPU Screen Recorder
A Vicinae extension for controlling [GPU Screen Recorder](https://git.dec05eba.com/gpu-screen-recorder/)
## Features
- **Recording Modes**: Standard screen recording or instant replay (like NVIDIA ShadowPlay)
- **Multiple Capture Sources**: Current monitor, specific monitor selection, or window capture via Wayland portal
- **Quality Presets**: Medium, High, Very High, Ultra
- **Audio Sources**: Support for system audio and application audio (PipeWire required)
## Commands
### Main Control Panel
The main command provides a unified control panel with all settings.
### Commands
- **Start Recording** - Begin standard screen recording
- **Stop Recording** - Stop active recording and save
- **Toggle Recording** - Start/stop recording (mode-aware)
- **Start Instant Replay** - Begin instant replay buffer recording
- **Stop Instant Replay** - Stop instant replay mode
- **Save Instant Replay** - Save the current buffer to file (Ctrl+S when in instant replay)
## Screenshots
> ![Main Control Panel](assets/main-view-screenshot.png)
> ![Quick Commands](assets/commands-screenshot.png)

## Traps
- The recorder is started `detached`, in a session of its own. A no-view command's
  worker is torn down the moment the command answers, and the recorder rode in the
  worker's process group: the teardown killed it while the toast said the recording
  had started. The answer now comes from `pidof`, not from the shell, and the
  recorder's output goes to `$TMPDIR/gpu-screen-recorder.log` so a start that dies
  can say why.
- Window capture is `-w portal`, and the portal needs an interactive picker: with no
  application id the Hyprland portal answers `SHAREDATA returned selection -1` and
  gsr fails at once ("desktop portal capture failed"). That is fatal for a start
  with no window on screen, so pick a monitor for the commands.
- The save location comes back from `ps -p <pid> -o args=`, which joins the args
  with spaces and drops the quoting. Reading one word after `-o` cut every path
  with a space in it (`…/My Recordings/x.mp4` → `…/My`), so the whole tail after
  the last `-o` is the path — measured with 6.1.7 writing
  `/tmp/opencode/space dir/re c.mp4`.

## Tests

`npm test` runs `test/recorder.test.ts` under `tsx`: the pure parsers and the
argv readers against gpu-screen-recorder 6.1.7's own output, captured on this
machine. `src/recorder.ts` imports no `@vicinae/api`, which is what lets the
test load it headless.

## Requirements
- [GPU Screen Recorder](https://git.dec05eba.com/gpu-screen-recorder/)
