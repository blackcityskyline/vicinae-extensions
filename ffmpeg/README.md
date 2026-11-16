# ffmpeg

Eight commands over the `ffmpeg` this machine already has. `media-info` is the
original one (probe, preview, rotate, VideoLoop); the rest is the
[Raycast media-converter](https://github.com/raycast/extensions/tree/main/extensions/media-converter)
port.

| Command | Does |
| --- | --- |
| Media Info | pick files, then container, size, duration, bitrate, one section per stream, a preview frame, rotate, VideoLoop |
| Convert Media | video, image and audio to another format, with quality controls, trim, strip metadata, output folder, target size, presets, or queue it |
| Merge Media | concatenate two or more files of one type; stream-copies when the streams match, re-encodes and pads otherwise |
| Edit Media | resize/crop, speed 0.25×–40×, frame rate 24/30/60, remove audio, extract audio, normalise loudness, burn or remove subtitles |
| Inspect Media | one row per file: container, duration, bitrate, every stream, metadata |
| View Conversion History | the last 200 conversions, merges and edits, with re-run, open, copy the command, remove |
| Manage Presets | built-in presets from `config/built-in-presets.json` plus your own: create, edit, duplicate, delete |
| Conversion Queue | persistent jobs, one at a time, reorder, cancel, retry, clear |

FFmpeg **6.0 or newer** is required. The resolver tries, in order, the
`Custom FFmpeg Path` preference, `$FFMPEG_BIN`, `ffmpeg` on `PATH`, then
`/usr/bin`, `/usr/local/bin`, `/bin`, snap, flatpak, nix and `~/.local/bin`. If
nothing is found the command says which package to install and re-checks on
request; there is no download.

## Preferences

Seventeen, all optional except none: default output formats per media type, the
per-format default quality, output location, strip-metadata default, advanced
settings visibility, and the custom FFmpeg path. `Default Image Output Format`
offers no HEIC, because HEIC output needs macOS `sips`.

## Measured

Sources: a 3 s 640×360 H.264/AAC clip, an 800×600 PNG, a 2 s MP3. Machine ffmpeg
`n9.0.2`, CRF defaults.

| Run | Output | Time |
| --- | --- | --- |
| video → mp4, CRF 13 | 329 KB → 584 KB | 1.3 s |
| video → webm, VP9/Opus | 498 KB | 10.2 s |
| video → gif, 15 fps, palettegen | 964 KB | 1.7 s |
| image → webp, quality 80 | 54 KB → 17 KB | 0.4 s |
| image → avif, libaom, CRF 13 | 36 KB | 3.6 s |
| audio → flac, level 5 | 50 KB → 271 KB | 0.3 s |
| video → mp4, 1 MB target, 2-pass | 2520 kbit/s → 944 KB | — |
| video → mp4, trim 1 s–2 s | 1.000 s, 201 KB | — |

Every output decodes with `ffmpeg -v error -i … -f null -`. Merging: two
identical clips stream-copy into 6.02 s with no re-encode; a 640×360@30 + a
320×240@25 clip re-encode through the `scale`+`pad` filter into 5.00 s; two MP3s
concat-copy into 4.04 s; a repeated output name gets `(1)`, it never overwrites.

Editing, each verified on the same clip: crop 200×200 at 20,20 then scale → 320
px wide; 2× → 1.57 s; 0.5× at 24 fps → 6.00 s; 60 fps → 60/1; remove audio → no
audio stream; extract → MP3; `loudnorm=I=-14`; burn an SRT; remove subtitles from
an MKV. Out-of-range values are refused with the reason: speed outside
0.25–40 shows `Speed must be between 0.25× and 40×`, half a crop shows
`Enter both crop width and crop height`, `-100` LUFS shows the allowed range.

## Ported, not deployed

Upstream `media-converter` at `ebc6660dd359d62915350abb679c3b070184662d`. What is
missing, and why:

- **AI tools** (`tools/convert-media.ts`, `merge-media.ts`): Vicinae has no tool
  surface.
- **The FFmpeg downloader** (`utils/ffmpeg-static/`, `useFFmpegInstaller`,
  `axios`): it fetches a macOS or Windows build into `supportPath`; Linux has
  ffmpeg in the package manager.
- **HEIC output**: it shells out to macOS `sips`. Old presets that name HEIC are
  still parsed but conversion refuses with that reason. HEIC **input** is skipped
  in the picker: this build has no HEIF demuxer, and `sips` is not here to unpack
  the frame first.
- **The Finder selection**: `getSelectedFinderItems()` does not exist in
  `@vicinae/api`. Convert prefills the picker from the clipboard when it holds a
  media path; the other commands open with an empty picker.
- **Toast actions**: Vicinae's toast has no `primaryAction`/`secondaryAction`, so
  "Open file" after a conversion, "Cancel" during one and "Configure FFmpeg" are
  gone. Cancel is still `ctrl+.` in the form; the output is opened from history
  or the queue.
- **`showInFinder`** is `showInFileBrowser(path, { select: true })`.

Shortcuts follow the keybind table in `docs/authoring-extensions.md`: generic
verbs use the named form (`shortcut="open"`), domain verbs take `ctrl+…`. The
ported UI used `cmd`, which is Super on Linux; every one is `ctrl` here.

## `media-info`

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

## Tests

`npm test` runs both suites: the `media-info` self-checks and the 15 ported
`test/unit/*` suites under a `@vicinae/api` stub (`test/register.mjs`). The stub
also intercepts `@vicinae/api` now that the source imports Vicinae's names
directly: importing `@raycast/api` would type-check against Raycast's API and hide
every function Vicinae does not have.
