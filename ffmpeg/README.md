# ffmpeg

Media info for the files you pick, plus the conversions upstream offers: rotating
and a silent 1080p VideoLoop.

| Command | What it does |
| --- | --- |
| Media Info | Pick one or more files, then read the container, size, duration, bitrate and one section per stream; Enter opens the action list |

The picker is prefilled when the clipboard holds the path of an existing file, so
copying a path is enough. There are no preferences and no background work: nothing
runs until the form is submitted.

## Actions

Open the panel with `ctrl+b`.

| Action | Key | What it does |
| --- | --- | --- |
| Run FFmpeg Action | `enter` | The action list: VideoLoop, rotate, copy |
| Copy Video Info | `ctrl+shift+c` (`copy`) | The pane's text on the clipboard |
| Copy File Path | `ctrl+shift+,` (`copy-path`) | The selected path |
| Display Setting → Show/Hide Preview Image | — | Whether the pane extracts a frame; the choice is kept in `Cache` |

In the action list:

| Action | What it does |
| --- | --- |
| Convert VideoLoop | Silent H.264 MP4 next to the original, `_videoloop` suffix, x264 `veryslow`, ~4000 kbit/s, short side 1080, `+faststart` |
| Copy Video Info / Copy File Path | Same clipboard actions, then back to the list |
| Rotate 180° / Right (90°) / Left (-90°) | `rotate=PI`, `transpose=1`, `transpose=0`; suffix `_rotate_180`, `_rotate_right`, `_rotate_left` |

A run reports its percentage in the toast, parsed from ffmpeg's own `Duration:` and
`time=` lines. Output names never overwrite an existing file: `_videoloop.mp4`, then
`_videoloop.1.mp4`.

The preview image is the first frame scaled to 480 px, cached under
`~/.cache/vicinae/ffmpeg/<md5>.jpg` where the hash is the file's path, size and
modification time — a changed file is never shown with an old frame.

## Keys

| Action | Key |
| --- | --- |
| Copy Info | `ctrl+shift+c` (`copy`) |
| Copy Path | `ctrl+shift+,` (`copy-path`) |
| Submit the form | `ctrl+s` (`save`) |

## Measured

Against `ffprobe` n9.0.2 on this machine:

- One probe is 138 ms for a 2-second 1280×720 mp4, 106 ms for a JPEG: one
  `execFile`, no daemon.
- Every number arrives as a string (`"128000"`, `"2.000000"`), and a missing field
  is an absent key, not `null`, so a row with no value is left out instead of
  showing a placeholder.
- A file ffprobe cannot read exits 1 with `{}` on stdout and the reason on stderr
  (`Invalid data found when processing input`); the toast shows that line.
- A JPEG is a single `video` stream in an `image2` container with a 0.04 s duration
  and no frame count, so a still image is shown as an `Image` with no duration row.
  A 52-second MP3 has no resolution row and reads `2 (stereo)`.
- VideoLoop on that 2-second mp4 finished with a 636 kB 1920×1080 H.264 file that
  has a video stream and no audio stream.

## The picker keeps the keyboard

`Form.FilePicker` opens the platform's own "Select a file" window on mount and that
window takes focus, so `Return` activates the picker row instead of submitting. The
form is submitted by the action's shortcut, `ctrl+s`. Verified live: with the
clipboard holding the path, the field arrived prefilled, `ctrl+s` opened the file
list, and the pane showed `Basic File Info` (`Video`, `49.1 kB`), the path, and one
`Video Stream 1` section.

## Ported, not deployed

Upstream is `raycast/extensions/extensions/ffmpeg` at `c33bf4c`, one view command
that reads the macOS Finder selection with `getSelectedFinderItems()`. That function
does not exist in `@vicinae/api` (absent from the `.d.ts`, `undefined` at runtime)
and `FileSearch.search` returns no rows here, so the input has to be a picker — see
[`docs/audits/ffmpeg.md`](../docs/audits/ffmpeg.md). Metadata writing and the
`ffmpeg -formats`/`-h long` AI tools are not ported; the audit says why.
