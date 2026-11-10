import { shellQuote } from "./shell.ts";
import { isLossless, isSubtitles, isThumbnail, isVideo } from "./formats.ts";

/** Everything needed to build the command; the pid and timestamps are the API's. */
export interface JobOptions {
  url: string;
  format: string;
  quality: string;
  /** Absolute, `~` already expanded. */
  dir: string;
  playlists: boolean;
  /** "none", or a browser name for --cookies-from-browser. */
  cookies: string;
  metadata: boolean;
  /** Opus and FLAC cover art goes through mutagen, which may not be installed. */
  mutagen: boolean;
  /** The subtitles format only: language code for --sub-langs, or "all". */
  subtitleLanguage: string;
  /** The subtitles format only: file format for --convert-subs. */
  subtitleFormat: string;
}

export interface JobPaths {
  log: string;
  exit: string;
  title: string;
}

/**
 * yt-dlp's own machine-readable output: progress on stdout, the final path as
 * a marker line, and the raw title in its own file for the notification. The
 * CLI is launched by a shell only so the exit code can be read after the
 * worker is gone, so the title never reaches a shell.
 */
export function ytdlpArgs(job: JobOptions, paths: JobPaths): string[] {
  const args = [
    "--newline",
    "--no-colors",
    "--progress",
    "--no-simulate",
    "--print-to-file",
    "before_dl:%(title)s",
    paths.title,
    "--print",
    "after_move:FILE:%(filepath)j",
    "--progress-template",
    "download:PROGRESS:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
    job.playlists ? "--yes-playlist" : "--no-playlist",
  ];

  if (job.cookies && job.cookies !== "none") args.push("--cookies-from-browser", job.cookies);

  args.push("-P", job.dir, "-o", "%(title)s.%(ext)s");

  if (job.metadata && !isThumbnail(job.format) && !isSubtitles(job.format)) args.push("--embed-metadata");

  if (isSubtitles(job.format)) {
    // The text only. A published track when there is one, machine captions
    // otherwise; --no-quiet is what puts the written path in the log, since
    // --print silences yt-dlp's own reporting. The config file is ignored
    // because its own --sub-langs is merged with this list, not replaced.
    args.push(
      "--ignore-config",
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      job.subtitleLanguage || "en",
      "--convert-subs",
      job.subtitleFormat || "srt",
      "--no-quiet",
    );
  } else if (isThumbnail(job.format)) {
    // The image only: no audio and no video stream. `--no-quiet` is what puts
    // the written thumbnail's path in the log, since --print silences it.
    args.push("--skip-download", "--write-thumbnail", "--no-quiet");
    if (job.quality !== "best") args.push("--convert-thumbnails", job.quality);
  } else if (isVideo(job.format)) {
    const cap = job.quality === "best" ? "" : `[height<=${job.quality}]`;
    if (job.format === "mp4") {
      args.push(
        "-f",
        `bv*${cap}[ext=mp4]+ba[ext=m4a]/b${cap}[ext=mp4]/bv*${cap}+ba/b${cap}`,
        "--merge-output-format",
        "mp4",
        // Ignored when a single stream already carries everything, so a
        // pre-muxed source is remuxed here instead of staying as it came.
        "--remux-video",
        "mp4",
      );
    } else if (job.format === "webm") {
      args.push(
        "-f",
        `bv*${cap}[ext=webm]+ba[ext=webm]/b${cap}[ext=webm]/bv*${cap}+ba/b${cap}`,
        // WebM cannot hold H.264, so a non-WebM source is re-encoded.
        "--recode-video",
        "webm",
      );
    } else {
      args.push("-f", `bv*${cap}+ba/b${cap}`, "--merge-output-format", "mkv", "--remux-video", "mkv");
    }
  } else {
    args.push("-f", "bestaudio/best", "-x", "--audio-format", job.format);
    if (!isLossless(job.format)) {
      // 0 is the best VBR setting for MP3; Opus is re-encoded at 192k unless
      // the source already is Opus.
      args.push("--audio-quality", job.quality === "best" ? (job.format === "opus" ? "192K" : "0") : job.quality);
    }
    const cover =
      job.metadata && (job.format === "mp3" || job.format === "m4a" || (job.mutagen && (job.format === "opus" || job.format === "flac")));
    if (cover) args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }

  // A yt-dlp config file may turn subtitles on globally; the format chosen here
  // is the only say that counts for a job started here.
  if (!isSubtitles(job.format)) args.push("--no-write-subs", "--no-write-auto-subs");

  args.push(job.url);
  return args;
}

/** The shell the detached job runs: download, record the exit code, notify. */
export function jobScript(job: JobOptions, paths: JobPaths): string {
  const command = ["yt-dlp", ...ytdlpArgs(job, paths)].map(shellQuote).join(" ");
  return [
    `${command} > ${shellQuote(paths.log)} 2>&1`,
    "code=$?",
    `printf '%s\\n' "$code" > ${shellQuote(paths.exit)}`,
    `title=$(cat ${shellQuote(paths.title)} 2>/dev/null)`,
    `[ -n "$title" ] || title=${shellQuote(job.url)}`,
    `if [ "$code" -eq 0 ]; then notify-send -a Vicinae "Download finished" "$title"; else notify-send -a Vicinae "Download failed" "$title"; fi`,
  ].join("\n");
}

export interface Progress {
  downloaded: number | null;
  total: number | null;
  speed: number | null;
  eta: number | null;
}

function number(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `PROGRESS:downloaded|total|estimate|speed|eta`, as the template prints it. */
export function parseProgress(line: string): Progress | null {
  if (!line.startsWith("PROGRESS:")) return null;
  const fields = line.slice("PROGRESS:".length).split("|");
  if (fields.length < 5) return null;
  return {
    downloaded: number(fields[0] ?? ""),
    total: number(fields[1] ?? "") ?? number(fields[2] ?? ""),
    speed: number(fields[3] ?? ""),
    eta: number(fields[4] ?? ""),
  };
}

/** The newest progress line in a chunk of log, if any. */
export function latestProgress(log: string): Progress | null {
  const lines = log.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const progress = parseProgress((lines[index] ?? "").trim());
    if (progress) return progress;
  }
  return null;
}

/** The last `FILE:` marker, a JSON string as `%(filepath)j` prints it. */
export function lastFile(log: string): string | null {
  const lines = log.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = (lines[index] ?? "").trim();
    if (!line.startsWith("FILE:")) continue;
    try {
      const value: unknown = JSON.parse(line.slice("FILE:".length));
      if (typeof value === "string" && value) return value;
    } catch {
      return null;
    }
  }
  return null;
}

/** A thumbnail download has no `%(filepath)` marker; yt-dlp only logs the
 * written file. The conversion target replaces the source extension. */
export function thumbnailFile(log: string, quality: string): string | null {
  const matches = [...log.matchAll(/Writing video thumbnail \d+ to: (.+)$/gm)];
  const written = matches[matches.length - 1]?.[1]?.trim();
  if (!written) return null;
  if (quality === "best") return written;
  return written.replace(/\.[^./]+$/, `.${quality}`);
}

/** Same story for a subtitle track: the log names the file yt-dlp wrote
 * (`.en.vtt` and the like), and the last extension becomes the chosen format. */
export function subtitleFile(log: string, format: string): string | null {
  const matches = [...log.matchAll(/Writing video .*subtitles to: (.+)$/gm)];
  const written = matches[matches.length - 1]?.[1]?.trim();
  if (!written) return null;
  return written.replace(/\.[^./]+$/, `.${format || "srt"}`);
}

export function percent(progress: Progress | null): number | null {
  if (!progress?.total || progress.downloaded === null) return null;
  return Math.min(100, Math.max(0, Math.round((progress.downloaded / progress.total) * 100)));
}

export function formatBytes(value: number | null): string {
  if (value === null || value <= 0) return "";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit === 0 ? Math.round(size) : size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatEta(value: number | null): string {
  if (value === null || value < 0) return "";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (part: number) => String(part).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The progress accessory: "45% · 2.1 MiB/s · 0:12", or the failure reason. */
export function progressText(progress: Progress | null): string {
  const parts: string[] = [];
  const done = percent(progress);
  if (done !== null) parts.push(`${done}%`);
  const speed = formatBytes(progress?.speed ?? null);
  if (speed) parts.push(`${speed}/s`);
  const eta = formatEta(progress?.eta ?? null);
  if (eta) parts.push(eta);
  return parts.join(" · ");
}

/** "https://a b" and "https://a,https://b" are three links, not one. */
export function splitLinks(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((link) => link.trim()).filter(Boolean))];
}
