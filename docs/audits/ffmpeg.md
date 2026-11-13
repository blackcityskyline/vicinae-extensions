# Audit: FFmpeg media info, and what replaced the Finder selection

Measured on this machine on 2026-11-12 against `ffmpeg`/`ffprobe` **n9.0.2** (Arch),
and against `@vicinae/api` 0.29.0's own `.d.ts` and runtime. Media used: a JPEG from
`~/Downloads`, the GOG soundtrack MP3, and a 2-second 1280×720 H.264/AAC file
generated with `testsrc`.

## The input is gone, not broken

The roadmap note said `getSelectedFinderItems()` throws. It is worse and simpler:

| Probe | Result |
| --- | --- |
| `grep -r getSelectedFinderItems node_modules/@vicinae/api/dist` | **0 matches** — the function does not exist in the API |
| `typeof api.getSelectedFinderItems` at runtime | `undefined`, so upstream's call is a `TypeError` |
| `typeof api.getSelectedText` | `function` |
| `FileSearch.search("AITHEME1")` and four other queries | `0` results in **0–1 ms** each — no index is consulted |
| `Form.FilePicker` | Present, `value: string[]`, used by four extensions in this repository already |

Vicinae has no notion of "the files selected in a file manager", and its file index
is empty here, so neither Finder selection nor a search list can be the input. What
is left is the platform's own file dialog (`Form.FilePicker`), prefilled from the
clipboard when that clipboard holds a path. That is why this cannot be a deploy:
upstream's `Entrance` awaits the missing function, swallows the error, and renders
its "select a file" tip forever.

## What ffprobe answers

`ffprobe -v error -print_format json -show_format -show_streams <file>`:

| Input | Exit | Body |
| --- | --- | --- |
| 1280×720 H.264 + AAC mp4 | 0 | 4342 bytes: `format` (`format_name`, `duration`, `bit_rate`, `size`), a `video` stream (`codec_name`, `width`, `height`, `r_frame_rate`, `avg_frame_rate`, `bit_rate`, `nb_frames`) and an `audio` stream (`codec_name`, `sample_rate`, `channels`, `bit_rate`) |
| 52-second MP3 | 0 | 1945 bytes, one `audio` stream: `mp3`, 44100 Hz, 2 channels, 128 kbit/s |
| 3024×4032 JPEG | 0 | one `video` stream with `codec_name: mjpeg`, `width`/`height`, `pix_fmt`; no `format.duration` |
| A `.txt` file | **1** | body is `{}`; the reason is on **stderr**: `Invalid data found when processing input` |

Two consequences. Numbers arrive as strings (`"128000"`, `"2.000000"`), so every
display needs parsing, and a missing field is a missing key rather than `null`. And a
failed probe is exit 1 plus a stderr line, so the error path reads stderr, not the
JSON.

Cost per probe: 138 ms for the mp4, 106 ms for the JPEG — one `execFile`, no daemon,
no polling. The first field a person reads (duration, resolution, bitrate) is in the
first 400 bytes of the JSON.

## Upstream, measured

`raycast/extensions` → `extensions/ffmpeg` by RenderCoder, one `index` view command,
`platforms: ["macOS"]`, 1499 lines across 26 files, six dependencies (`cachedir`,
`filesize`, `rct-state`, `strip-ansi` plus Raycast's two).

What it does with those lines:

| Part | Lines | What it is |
| --- | --- | --- |
| `managers/fileManager.ts` + `rct-state` | 330 | A hand-rolled observable store for the selected file, its streams, preview images and the running conversion |
| `views/runAction.tsx` + `type/action.ts` | 210 | A menu of ffmpeg conversions: VideoLoop, GIF, audio extraction, plus progress parsing from ffmpeg's log |
| `utils/fs.ts` | 88 | `getSelectedFinderItems()`, then a per-file "strict filter" using `ffmpeg -i … -f null -` twice to ask whether a stream exists |
| `utils/ffmpeg/generatePreviewImage.ts` + `md5.ts` + `cachedir` | 73 | Extract a frame, hash the file, cache the thumbnail in `~/Library/Caches` |
| `utils/ffmpeg/execute.ts` | 128 | Two shell wrappers, one of them piping through `grep` |
| `utils/ffmpeg/metadata.ts` + `views/writeMetadata.tsx` | 40 | `-metadata key=value` rewriting the source path with `_new` |
| `tools/list.ts` + `get-help.ts` | 67 | `ffmpeg -formats`-style listings |
| `components/tipForInstallFFmpeg.tsx` | 45 | A macOS `brew install` instruction |

| Cut or changed | Why |
| --- | --- |
| Finder selection (`utils/fs.ts`, most of it) | The API does not exist. `Form.FilePicker` is the dialog, `Clipboard.readText()` the prefill. The picker now takes several files, so upstream's "several selected files" list is kept |
| `FileType` detection with two `ffmpeg -i` runs per file | Replaced by the probe: `codec_type: video/audio` already answers it, one subprocess fewer per file |
| The `rct-state` store, `strip-ansi`, `filesize`, `cachedir`, `md5` | React state, `size()` from `utils/media.ts`, and Node's `fs`/`crypto`; no runtime dependency was added |
| Metadata writing (`writeMetadata.tsx`) | Rewrites the source file or a sibling copy — a destructive editing flow behind one menu row; upstream's view is a stub that lists the path and nothing else |
| `ffmpeg -formats`/`-h long` AI tools (`tools/`) | Hundreds of rows of codec names that a terminal prints better; they are Raycast AI tools, not views. `@vicinae/api` has no tool surface here |
| The `brew install ffmpeg` tip | Arch: the failure is `ENOENT` from `spawn`, and the message names the `ffmpeg` package |

## The second pass: conversions, as upstream has them

The first version cut the action list. This pass ports it with the same ffmpeg
commands, as argument vectors instead of shell strings (nothing goes through a
shell, so a path with a space or a quote is one argument):

| Upstream | Here |
| --- | --- |
| `-i file -vf rotate=PI` (or `transpose=0`, `transpose=1`) `out` | `rotateArgs` in `utils/ffmpeg.ts`, output `_rotate_<direction>` with `.N` on collision |
| VideoLoop: `libx264 -preset veryslow -b:v 4000k -profile:v main -level:v 4.0 -pix_fmt yuv420p`, scaling filter, `-bsf:v filter_units=remove_types=6 -fflags +bitexact -write_tmcd 0 -an -color_trc bt709 -movflags +faststart` | `videoLoopArgs`, char-for-char, appended `.mp4` |
| Progress from `Duration:` and `time=` lines, shown in the row's detail | The same two regexes, shown in the toast (`Processing: 37 %`) and in the page |
| Preview frame at `select=eq(n\,0)`, `-q:v 50`, cached by an md5 of the file | `select=eq(n\,0),scale=480:-2`, `-q:v 2` (`50` is outside the JPEG qscale range and ffmpeg clamps it to the worst value), cached under `~/.cache/vicinae/ffmpeg/` keyed by path + size + mtime |
| Show/Hide preview kept in `Cache` | Same, key `previewImage` |
| Selected files via Finder | Files picked in the form, then one row per file with the pane following the selection |

Measured live on 2026-11-13, `ffmpeg` n9.0.2:

| Step | Result |
| --- | --- |
| Form with a clipboard path | Field prefilled, `ctrl+s` submitted |
| File list | One row for the picked mp4; pane: `Basic File Info` → `Video` + `49.1 kB`, file name and path, then `Video Stream 1` with its rows |
| Preview frame | `~/.cache/vicinae/ffmpeg/56f55642700e3aa67fface785a28dedb.jpg`, 19 kB, written once |
| Convert VideoLoop | 2-second 720p source → 636 kB `sample_videoloop.mp4`, `1920×1080`, H.264, **one video stream and no audio**, 2.0 s |

The probe still has to answer for the pane: a video shows resolution, fps and
per-stream bitrates; an audio file hides the resolution rows; a JPEG reads as an
`Image`; a rejected file shows ffprobe's stderr line; no `ffprobe` says so.
