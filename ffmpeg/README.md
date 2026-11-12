# ffmpeg

Media info for one picked file, from one `ffprobe` call.

| Command | What it does |
| --- | --- |
| Media Info | Pick a file, then read its container, size, duration, bitrate and one section per stream |

The picker is prefilled when the clipboard holds the path of an existing file, so
copying a path is enough. There are no preferences and no background work: nothing
runs until the form is submitted.

## Keys

| Action | Key |
| --- | --- |
| Copy Info | `ctrl+shift+c` (`copy`) |
| Copy ffprobe JSON | `ctrl+shift+.` (`copy-name`) |
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

## The picker keeps the keyboard

`Form.FilePicker` opens the platform's own "Select a file" window on mount and that
window takes focus, so `Return` activates the picker row instead of submitting. The
form is submitted by the action's shortcut, `ctrl+s`. Verified live: with the
clipboard holding the path, the field arrived prefilled and the Detail pane showed
`Name: sample.mp4`, `Size: 49.1 kB`, `Container: QuickTime / MOV`, `Duration: 0:02`,
`Overall Bit Rate: 196 kbit/s`, `Streams: 2`, `Resolution: 1280x720`, `Frame Rate:
30 fps`.

## Ported, not deployed

Upstream is `raycast/extensions/extensions/ffmpeg`, one view command that reads the
macOS Finder selection with `getSelectedFinderItems()`. That function does not exist
in `@vicinae/api` (absent from the `.d.ts`, `undefined` at runtime) and
`FileSearch.search` returns no rows here, so the input has to be a picker — see
[`docs/audits/ffmpeg.md`](../docs/audits/ffmpeg.md). Conversions, the preview cache,
the metadata writer and the `ffmpeg -formats` listings are cut: the launcher is a
viewer, and `ffmpeg` is one shell call away.
