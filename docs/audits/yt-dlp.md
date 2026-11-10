# Audit: Omarchy yt-dlp → Vicinae

The Omarchy bar widget [`Alibest69420/omarchy-ytdlp`](https://github.com/Alibest69420/omarchy-ytdlp)
is QML running inside `omarchy-shell`; none of it can be loaded by Vicinae. What
was kept is the behaviour — format table, yt-dlp arguments, container rules — and
the parts that were not rebuilt. Numbers were counted on the checkout, not
estimated.

## Scale

| | Upstream | Port |
| --- | --- | --- |
| Language | QML, JS and Python inside Quickshell | TypeScript and React |
| Lines of app code | 2 590 | 736 |
| Checks | 1 Python suite (metadata helper) | 9 self-checks |
| Dependency | `omarchy-shell` + `quickshell` | `@vicinae/api` |
| Commands | one bar popup + a settings page | Download, Downloads |

## Kept

- The format catalogue and the quality lists per container (`Formats.js` →
  `utils/formats.ts`), including MP3's V0 default and Opus's 192k re-encode.
- The yt-dlp argument set (`DownloadEngine.qml`): `-x` and `--audio-format` for
  audio, the `bv*[height<=…]` selectors for video, MP4 preferring MP4/AAC streams,
  MKV remuxing, WebM re-encoding, `--embed-metadata`, `--embed-thumbnail` only
  where the container and mutagen allow it.
- Marker-based progress (`--progress-template`) and the final `%(filepath)j`
  marker instead of scraping the human log.
- Metadata only when the source can hold it: WAV gets no cover, Opus/FLAC only
  with mutagen, which is checked once at submit.
- **Subtitles**: a checkbox and a language dropdown (`--write-subs
  --write-auto-subs --sub-langs … --convert-subs srt`). The widget has no subtitle
  support at all, so this is new rather than ported. Off means
  `--no-write-subs --no-write-auto-subs`, because a global yt-dlp config can turn
  them on otherwise — the checkbox is the only say that counts.
- **Thumbnail**: a format of its own (`--skip-download --write-thumbnail`). yt-dlp
  offers no thumbnail resolution knob, so the quality dropdown picks the image
  format instead (original, JPG, PNG, WebP). `--no-quiet` is required for the
  written path to reach the log, which is how the row finds the file: no
  `%(filepath)` marker is printed for an image-only download.

## Rebuilt differently

- **Queue.** Upstream runs one job at a time in a QML component with cancel and
  retry. Here each link is a detached `sh` job with a directory under the
  extension's support path; the Downloads view is a projection of those
  directories, so a restart of the launcher loses nothing and the view only
  polls while it is open.
- **Completion.** Upstream listens to the process it owns. Here the shell writes
  the exit code and calls `notify-send` itself, since the worker that started
  yt-dlp is gone long before the download is.
- **Metadata helper.** The 297-line `bin/embed-metadata.py` writes tags through
  mutagen for Opus and ffmetadata for everything else, to keep titles off
  ffmpeg's command line. This port uses yt-dlp's `--embed-metadata` and
  `--embed-thumbnail` directly: the values are public video metadata, and the
  arguments are built as an argv array, never interpolated into a shell. What
  the upstream needed for path confinement — a private tmpfs, a manifest on
  stdin, symlink checks — does not apply here, since yt-dlp writes the tags.

## Dropped

- **Bar widget and popup** (`Panel.qml`, `Card.qml`, `JobRow.qml`): no menu-bar
  surface in Vicinae; the two commands replace them.
- **Settings page** (`Settings.qml`, `SettingsToggle.qml`): folded into the
  manifest's preferences.
- **Bar icon placement, `install.sh`**: an `omarchy plugin` concept.
- **IPC** (`quickshell ipc … download/enqueue/status`): a launcher command is
  already one keystroke away.
- **Folder favorites, filename template, per-download cookie choice**: values
  that never needed a UI here; the folder is typed, the template is yt-dlp's
  default, cookies are one preference.

## Verification

- `npm run lint`, `npm run check`, `npm test` (9 checks) and `npm run build`
  pass; both commands load in Vicinae without an error in the logs.
- The generated job script was run under real `sh` with a real yt-dlp download
  (`sample-5s.mp4` → `sample-5s.mp3`): progress markers, `FILE:` marker, title
  file, exit code `0` and the completion notification all appeared where the
  extension reads them. A second run with an unavailable video wrote exit code
  `1` and the failure notification.
- A thumbnail job (`thumbnail`, PNG, subtitles on) on a real YouTube link wrote
  `Me at the zoo.png` and `Me at the zoo.en.srt`, and the same job with the
  subtitle box off wrote no `.srt` file, even though the machine's
  `~/.config/yt-dlp/config` enables subtitles globally.
- Not verified: pressing through the form and watching the list poll a real job.
  The screen capture available in this session does not include the launcher
  layer (the shell's bar is missing from it too), so the views were checked by
  loading them only.
