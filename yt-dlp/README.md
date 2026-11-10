# yt-dlp

Download audio and video from a link with `yt-dlp`, without leaving the launcher.
Audio: Opus, MP3, FLAC, M4A and WAV. Video: MP4, MKV and WebM, capped at a
resolution you choose.

## Commands

| Command | What it does |
| --- | --- |
| Download | Paste one or more links, pick a format, quality and folder, and start. The window closes; the job does not |
| Downloads | Live progress of everything started here: cancel, retry, open the file or its folder, remove a row |

Several links can be pasted at once, one per line or separated by commas; each
one becomes its own job. Jobs run in parallel and disappear from the list only
when removed.

## How a job runs

`yt-dlp` is started detached by `sh`, so closing the launcher (or the whole
extension worker) does not stop it. The shell writes the exit code and sends a
desktop notification through `notify-send` when the download finishes or fails.
While the Downloads view is open it polls the job's log once a second; the
progress itself is yt-dlp's own `--progress-template` output, not scraped text.

Each job keeps its state in `~/.local/share/vicinae/support/yt-dlp/jobs/<id>/`:
`meta.json` (the command), `log.txt` (progress and errors), `exit.txt` (the exit
code, once finished) and `title.txt` (what yt-dlp called it). Finished files stay
where they were downloaded.

## Formats and quality

| Format | Quality choices |
| --- | --- |
| Opus | Best (source Opus is copied, otherwise 192k), 192k, 160k, 128k, 96k, 64k |
| MP3 | Best (V0 VBR), 320k, 256k, 192k, 128k, 96k |
| M4A (AAC) | Best (source AAC), 320k, 256k, 192k, 128k, 96k |
| FLAC, WAV | Lossless container; the source is usually lossy, so nothing is restored |
| MP4 | Best, 2160p, 1440p, 1080p, 720p, 480p, 360p. Prefers MP4/AAC and remuxes single-stream sources |
| MKV | Same caps; best available streams, remuxed into MKV |
| WebM | Same caps; WebM sources are kept, others are re-encoded, since WebM cannot hold H.264 |
| Thumbnail | Best (original format), JPG, PNG, WebP. Downloads the image only, no media |

## Subtitles

Tick **Subtitles** and a language dropdown appears next to it. The track is saved
as `.srt` beside the media, in the language chosen (or every available language).
A published subtitle track is used when the video has one, machine captions
otherwise. With the box unticked, subtitles are explicitly switched off, even
when a global `yt-dlp` config turns them on.

**Write metadata tags** (a preference, on by default) adds `--embed-metadata` and,
on audio, cover art: always for MP3 and M4A, and for Opus and FLAC only when
`python-mutagen` is importable, because yt-dlp cannot embed Opus/FLAC covers
without it.

## Preferences

| Preference | Default | Meaning |
| --- | --- | --- |
| Audio Folder | `~/Music` | Folder the form starts on for audio formats |
| Video Folder | `~/Videos` | Folder the form starts on for video formats |
| Default Format | Opus | Format the form starts on |
| Write metadata tags | On | Tags and cover art in the finished file |
| Cookies From Browser | None | `--cookies-from-browser`, for links that need a signed-in session |

The folder field expands `~` and is created if missing.

## Requirements

- `yt-dlp` and `ffmpeg` in `PATH`
- `notify-send` for the completion notification
- `python-mutagen` for Opus and FLAC cover art (optional)
- A browser the cookies can be read from, if that preference is set

## Verification

- Thumbnail and subtitle jobs were run through the generated job script against
  real YouTube links: the PNG thumbnail and the English `.srt` appeared with the
  expected names, and an unticked subtitle box produced no `.srt` despite a
  global `yt-dlp` config that enables them.
- `npm test` covers the argument set for every format, subtitle flags, thumbnail
  path parsing and the shell that records the exit code.

## Not verified

- The Downloads list was not watched through a real job in the launcher: the view
  loads, but the screen capture used for checking does not include the launcher
  surface in this session.
- Changing the format mid-form keeps a folder the user typed; only the untouched
  default follows the format.
- This is not a queue: pasted links start together, so a playlist and a video
  download at the same time compete for bandwidth.
