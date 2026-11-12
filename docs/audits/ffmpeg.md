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

| Cut | Why |
| --- | --- |
| Finder selection (`utils/fs.ts`, most of it) | The API does not exist. `Form.FilePicker` is the dialog, `Clipboard.readText()` the prefill |
| `FileType` detection with two `ffmpeg -i` runs per file | The probe already says `codec_type: video/audio`; two subprocesses per file to learn what one JSON field says |
| All conversions (`runAction.tsx`, `ActionType`, the progress parser, the `rct-state` store) | The roadmap asks for media info, and a conversion UI is a different extension. The launcher stays a viewer; `ffmpeg` is still one shell call away |
| Preview image extraction, its cache, `md5`, `cachedir` | A frame plus a hashed cache directory for a thumbnail. `List.Item.Detail` with a metadata table reads better than a scaled JPEG |
| Metadata writing | Rewrites the source file or a sibling copy — a destructive editing flow behind one menu row |
| `ffmpeg -formats` listings | Hundreds of rows of codec names that `ffmpeg -formats` prints better in a terminal |
| `filesize`, `strip-ansi`, `rct-state` | One formatting function, one regex, one `useState` |
| The `brew install ffmpeg` tip | Arch: the check is "does `ffprobe -version` run", and the toast names the package |

What stays: the probe command it already uses (`-v error -print_format json
-show_format -show_streams`), the shape of the detail pane (file tags, then one
section per stream), and the "copy the info" action.

Estimated size: ~300 lines, no runtime dependency, one `view` command.

## What the extension has to prove

- The dialog is the input: `Form.FilePicker` opens, a path picked there reaches the
  detail pane, and a clipboard path prefills it.
- A video shows resolution, fps and per-stream bitrates; an audio file hides the
  resolution rows instead of printing `undefinedxundefined`.
- A JPEG — a single `video` stream with no duration — reads as an image, not as a
  broken video.
- A file ffprobe rejects shows ffprobe's own stderr line, not "exit 1".
- A machine without `ffprobe` says so, and does not spawn a probe per keystroke.
