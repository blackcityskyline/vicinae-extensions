# yt-dlp

Download audio and video from a link with `yt-dlp`, without leaving the launcher.
Audio: Opus, MP3, FLAC, M4A, WAV. Video: MP4, MKV, WebM, capped at a resolution
you choose.

## Commands

| Command | Does |
| --- | --- |
| Download | paste one or more links, pick format, quality and folder; the window closes, the job does not |
| Downloads | live progress: cancel, retry, open the file or folder, remove a row |

Pasted links, one per line or comma-separated, become separate jobs that run in
parallel and stay listed until removed.

## How a job runs

`yt-dlp` is started detached by `sh`, so closing the launcher does not stop it.
The shell writes the exit code and sends a `notify-send` notification when the
job ends. The Downloads view polls the job log once a second; progress is
yt-dlp's own `--progress-template` output.

State lives in `~/.local/share/vicinae/support/yt-dlp/jobs/<id>/`: `meta.json`,
`log.txt`, `exit.txt` and `title.txt`. Finished files stay where they were
downloaded.

## Formats and quality

| Format | Quality |
| --- | --- |
| Opus | best (source copied, otherwise 192k), 192k, 160k, 128k, 96k, 64k |
| MP3 | best (V0 VBR), 320k, 256k, 192k, 128k, 96k |
| M4A | best (source AAC), 320k, 256k, 192k, 128k, 96k |
| FLAC, WAV | lossless container; the source is usually lossy |
| MP4 | best, 2160p, 1440p, 1080p, 720p, 480p, 360p; prefers MP4/AAC, remuxes single-stream |
| MKV | same caps, best streams remuxed |
| WebM | same caps; WebM sources kept, others re-encoded |
| Thumbnail | best, JPG, PNG, WebP; image only |
| Subtitles | language picker plus SRT, VTT, ASS or LRC; text only |

Subtitles are saved as `<title>.<lang>.<format>`. The job passes
`--ignore-config`, because a config file's `--sub-langs` is merged rather than
replaced; other config settings, cookies included, do not apply, so set the
cookies preference when the site needs them. With any other format subtitles are
switched off explicitly.

`Write metadata tags` (on by default) adds `--embed-metadata` and cover art:
always for MP3 and M4A, and for Opus and FLAC only when `python-mutagen` is
importable.

## Preferences

| Preference | Default |
| --- | --- |
| Audio Folder | `~/Music` |
| Video Folder | `~/Videos` |
| Default Format | Opus |
| Write metadata tags | on |
| Cookies From Browser | None |

The folder field expands `~` and is created if missing.

## Requirements

`yt-dlp` and `ffmpeg` on `PATH`, `notify-send` for the notification, and
`python-mutagen` for Opus and FLAC cover art.

## Verified

Thumbnail and subtitle jobs ran against real links; a `de` subtitle was written
as `.srt` while the machine's config also lists `ru,en`, and a media job wrote no
`.srt` despite that config. `npm test` covers the arguments for every format, the
language and file pickers, path parsing and the exit-code shell.

Not verified: the Downloads list was not watched through a real job in the
launcher, and pasted links start together, so a playlist and a video compete for
bandwidth.
