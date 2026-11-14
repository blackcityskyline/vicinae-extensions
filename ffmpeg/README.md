# ffmpeg

Media info for the files you pick, plus upstream's conversions: rotating and a
silent 1080p VideoLoop.

| Command | Does |
| --- | --- |
| Media Info | pick files, then read container, size, duration, bitrate and one section per stream |

The picker is prefilled when the clipboard holds an existing path. No preferences
and no background work: nothing runs until the form is submitted.

## Actions

| Action | Key |
| --- | --- |
| Run FFmpeg Action | `enter` |
| Copy Video Info | `ctrl+shift+c` |
| Copy File Path | `ctrl+shift+,` |
| Show / Hide Preview Image | in Display Setting, kept in `Cache` |

| In the action list | Does |
| --- | --- |
| Convert VideoLoop | silent H.264 MP4 beside the original, `_videoloop` suffix, x264 `veryslow`, ~4000 kbit/s, short side 1080, `+faststart` |
| Rotate 180° / Right / Left | `rotate=PI`, `transpose=1`, `transpose=0`, with their own suffixes |

Progress is ffmpeg's own `Duration:` and `time=` parsed into the toast. A name
that exists is never overwritten: `_videoloop.mp4`, then `_videoloop.1.mp4`. The
preview is the first frame at 480 px, cached under `~/.cache/vicinae/ffmpeg/`
against the path, size and mtime.

`ctrl+s` submits the form, because `Form.FilePicker` opens the platform's file
window on mount and that window takes `Return`.

## Measured

Against `ffprobe` n9.0.2: one probe is 138 ms for a 2-second 1280×720 MP4, 106 ms
for a JPEG, one `execFile`. Every number arrives as a string and a missing field
is an absent key, so rows without a value are left out. An unreadable file exits
1 with `{}` on stdout and the reason on stderr, which the toast shows. A JPEG is
an `image2` container with a `video` stream, so it is shown as an Image with no
duration.

## Ported, not deployed

Upstream `raycast/extensions/extensions/ffmpeg` at `c33bf4c` reads the Finder
selection with `getSelectedFinderItems()`, which does not exist in `@vicinae/api`
and whose replacement, `FileSearch.search`, returns no rows here; hence the
picker. Metadata writing and the `ffmpeg` AI tools are not ported —
[`docs/audits/ffmpeg.md`](../docs/audits/ffmpeg.md).
