/**
 * Everything about an ffmpeg run that can be decided without running one: the
 * argument vectors of each action, the output name, and the progress lines.
 *
 * The argument vectors are upstream's (`raycast/extensions/extensions/ffmpeg`
 * at c33bf4c), with the shell quoting removed because nothing goes through a
 * shell here.
 */

import path from "node:path";

/** `00:01:02.50` → `62.5`; also accepts `1:02`. */
export function parseClock(value: string): number | undefined {
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) return undefined;

  let seconds = 0;
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isFinite(number) || number < 0) return undefined;
    seconds = seconds * 60 + number;
  }
  return seconds;
}

const DURATION = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/;
const TIME = /\btime=(\d+:\d+:\d+(?:\.\d+)?)/;

/** The total length line ffmpeg prints before the encode starts. */
export function readDuration(line: string): number | undefined {
  const match = DURATION.exec(line);
  return match?.[1] === undefined ? undefined : parseClock(match[1]);
}

/** A `time=…` line from ffmpeg's progress, as a percentage of the total. */
export function readPercent(line: string, duration: number): number | undefined {
  if (duration <= 0) return undefined;
  const match = TIME.exec(line);
  const current = match?.[1] === undefined ? undefined : parseClock(match[1]);
  if (current === undefined) return undefined;
  return Math.max(0, Math.min(100, Math.round((current / duration) * 100)));
}

/** `_videoloop.mp4`, then `_videoloop.1.mp4`, so an existing file is never overwritten. */
export function outputPath(
  file: string,
  suffix: string,
  extension: string,
  exists: (candidate: string) => boolean,
): string {
  const parsed = path.parse(file);
  const base = path.join(parsed.dir, `${parsed.name}${suffix}`);
  for (let index = 0; ; index += 1) {
    const candidate = `${base}${index === 0 ? "" : `.${index}`}${extension}`;
    if (!exists(candidate)) return candidate;
  }
}

export type Rotation = "180" | "left" | "right";

/** Upstream's VideoLoop: silent 1080p H.264, `veryslow`, faststart. */
export function videoLoopArgs(file: string, output: string): string[] {
  return [
    "-i",
    file,
    "-vcodec",
    "libx264",
    "-preset",
    "veryslow",
    "-b:v",
    "4000k",
    "-profile:v",
    "main",
    "-level:v",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale='trunc(ih*dar/2)*2:trunc(ih/2)*2',setsar=1/1,scale=w='if(lte(iw,ih),1080,-2)':h='if(lte(iw,ih),-2,1080)'",
    "-bsf:v",
    "filter_units=remove_types=6",
    "-fflags",
    "+bitexact",
    "-write_tmcd",
    "0",
    "-an",
    "-color_trc",
    "bt709",
    "-movflags",
    "+faststart",
    output,
  ];
}

export function rotateArgs(file: string, output: string, rotation: Rotation): string[] {
  const filter = rotation === "180" ? "rotate=PI" : rotation === "left" ? "transpose=0" : "transpose=1";
  return ["-i", file, "-vf", filter, output];
}

/** One frame, kept at a readable size: 480 px wide, JPEG quality 2. */
export function previewArgs(file: string, output: string): string[] {
  return ["-i", file, "-vf", "select=eq(n\\,0),scale=480:-2", "-frames:v", "1", "-q:v", "2", output];
}

export function rotationSuffix(rotation: Rotation): string {
  return `_rotate_${rotation}`;
}
