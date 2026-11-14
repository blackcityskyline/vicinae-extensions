# yt-dlp — Omarchy bar widget port

Upstream: [`Alibest69420/omarchy-ytdlp`](https://github.com/Alibest69420/omarchy-ytdlp),
QML inside `omarchy-shell`; none of it loads in Vicinae. Kept: the behaviour —
format table, yt-dlp arguments, container rules — and the parts not rebuilt.
Numbers counted on the checkout, not estimated.

## Scale

| | Upstream | Port |
| --- | --- | --- |
| Language | QML, JS and Python inside Quickshell | TypeScript and React |
| Lines of app code | 2 590 | 736 |
| Checks | 1 Python suite (metadata helper) | 9 self-checks |
| Dependency | `omarchy-shell` + `quickshell` | `@vicinae/api` |
| Commands | one bar popup + a settings page | Download, Downloads |

## Kept

- Format catalogue and quality lists (`Formats.js` → `utils/formats.ts`), with
  MP3's V0 default and Opus's 192k re-encode; arguments (`DownloadEngine.qml`):
  `-x` and `--audio-format` for audio, `bv*[height<=…]` selectors for video, MP4
  preferring MP4/AAC streams, MKV remuxing, WebM re-encoding, `--embed-metadata`,
  `--embed-thumbnail` only where the container and mutagen allow it.
- Marker-based progress (`--progress-template`) and the final `%(filepath)j`
  marker instead of the human log. Metadata only where the source holds it: WAV
  gets no cover, Opus/FLAC need mutagen, checked once at submit.
- **Subtitles** — a format of its own, language and subtitle-file-format pickers
  in place of the quality picker (`--skip-download --write-subs --write-auto-subs
  --sub-langs … --convert-subs …`); new, the widget has none. Other formats pass
  `--no-write-subs --no-write-auto-subs` because a global config can enable them.
  The subtitles job passes `--ignore-config`: yt-dlp merges a config's
  `--sub-langs` rather than replacing it (asking `ru` also wrote `en`, the
  machine's config listing `ru,en`).
- **Thumbnail** — a format of its own (`--skip-download --write-thumbnail`); no
  resolution knob exists, so the quality dropdown picks the image format
  (original, JPG, PNG, WebP). `--no-quiet` is needed for the written path to
  reach the log, an image-only download printing no `%(filepath)` marker.

## Rebuilt differently

- **Queue.** Upstream runs one job at a time in QML with cancel and retry; here
  each link is a detached `sh` job with a directory under the extension's support
  path, the Downloads view a projection of those directories, so a launcher
  restart loses nothing and the view polls only while open.
- **Completion.** Upstream listens to the process it owns; here the shell writes
  the exit code and calls `notify-send` itself, the worker being gone long before
  the download is.
- **Metadata helper.** The 297-line `bin/embed-metadata.py` writes tags through
  mutagen for Opus and ffmetadata otherwise, keeping titles off ffmpeg's command
  line. This port uses `--embed-metadata` and `--embed-thumbnail` directly: the
  values are public video metadata, and the arguments are an argv array, never
  interpolated into a shell. Upstream's path confinement — private tmpfs,
  manifest on stdin, symlink checks — does not apply, since yt-dlp writes the tags.

## Dropped

- **Bar widget and popup** (`Panel.qml`, `Card.qml`, `JobRow.qml`): no menu-bar
  surface in Vicinae; the two commands replace them.
- **Settings page** (`Settings.qml`, `SettingsToggle.qml`): folded into the
  manifest's preferences. **Bar icon placement, `install.sh`**: an `omarchy
  plugin` concept.
- **IPC** (`quickshell ipc … download/enqueue/status`): a launcher command is one
  keystroke away.
- **Folder favorites, filename template, per-download cookie choice**: no UI
  needed here; the folder is typed, the template is yt-dlp's default, cookies are
  one preference.

## Verification

- `npm run lint`, `npm run check`, `npm test` (11 checks) and `npm run build`
  pass; both commands load in Vicinae without an error in the logs.
- The generated job script ran under real `sh` with a real download
  (`sample-5s.mp4` → `sample-5s.mp3`): progress markers, `FILE:` marker, title
  file, exit code `0` and the completion notification appeared where the
  extension reads them; an unavailable video wrote exit code `1` and the failure
  notification. A thumbnail job on a real YouTube link wrote `Me at the zoo.png`,
  and a media job on the same link wrote no `.srt` file, although the machine's
  `~/.config/yt-dlp/config` enables subtitles globally.
- A subtitles job with `de`/`srt` wrote `Me at the zoo.de.srt` and nothing else,
  the config's `ru,en` list gone once `--ignore-config` is passed; with `ru`,
  which that video does not offer, the job finished with no file. The path comes
  from yt-dlp's `Writing video subtitles to:` log line with its last extension
  replaced, a text-only job printing no `%(filepath)` marker.

## Not verified

- Pressing through the form and watching the list poll a real job: the screen
  capture available does not include the launcher layer (the shell's bar is
  missing from it too), so the views were loaded only.
