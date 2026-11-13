/**
 * One `ffmpeg` subprocess per action, no daemon. Progress is read from stderr:
 * ffmpeg prints `Duration: 00:00:02.00` once, then a `time=…` on every
 * `-progress`-free status line.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { previewArgs, readDuration, readPercent } from "~/utils/ffmpeg";

export class FFmpegError extends Error {}

function lastLine(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
}

export async function runFFmpeg(args: string[], onPercent?: (percent: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let duration: number | undefined;
    let tail = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      tail = (tail + chunk).slice(-4000);
      for (const line of chunk.split(/\r\n|\r|\n/)) {
        duration ??= readDuration(line);
        if (duration === undefined) continue;
        const percent = readPercent(line, duration);
        if (percent !== undefined) onPercent?.(percent);
      }
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new FFmpegError("ffmpeg is not installed. On Arch it is in the ffmpeg package.")
          : error,
      );
    });

    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new FFmpegError(lastLine(tail) ?? `ffmpeg exited with code ${code}`));
    });
  });
}

/** `~/.cache/vicinae/ffmpeg` — a thumbnail is disposable, so it lives with the caches. */
export function previewDir(): string {
  const cacheHome = process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache");
  return path.join(cacheHome, "vicinae", "ffmpeg");
}

/**
 * The name is the file, its size and its modification time: a frame from an
 * older version of the file is never shown for a newer one.
 */
export async function previewPath(file: string): Promise<string> {
  const info = await stat(file);
  const hash = createHash("md5").update(`${file}:${info.size}:${info.mtimeMs}`).digest("hex");
  return path.join(previewDir(), `${hash}.jpg`);
}

/** Extract the first frame into the cache, once per file version. */
export async function previewImage(file: string): Promise<string> {
  const output = await previewPath(file);
  const existing = await stat(output).catch(() => undefined);
  if (existing !== undefined) return output;

  await mkdir(path.dirname(output), { recursive: true });
  await runFFmpeg(previewArgs(file, output));
  return output;
}
