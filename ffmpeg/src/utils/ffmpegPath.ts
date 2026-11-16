/**
 * Where the ffmpeg binary is. The extension never ships or downloads one: Linux
 * has it in the package manager, and the rest of the module assumes the same
 * binary that produced `ffmpeg -version` runs the conversions.
 */

import fs from "fs";
import os from "os";
import { getPreferenceValues } from "@vicinae/api";
import { runProcess } from "./process";

/** `6.1.1` → `6.1`; git master prints `n9.0.2`, so the `n` is optional. */
export function parseFfmpegVersion(stdout: string): number | null {
  const match = stdout.match(/ffmpeg version n?(\d+)\.(\d+)/);
  const majorRaw = match?.[1];
  const minorRaw = match?.[2];
  if (majorRaw === undefined || minorRaw === undefined) return null;
  const major = parseInt(majorRaw, 10);
  const minor = parseInt(minorRaw, 10);
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  return major + minor / 10;
}

export async function checkFFmpegVersion(ffmpegPath: string): Promise<number | null> {
  try {
    const { stdout } = await runProcess({ command: ffmpegPath, args: ["-version"] });
    return parseFfmpegVersion(stdout);
  } catch {
    return null;
  }
}

/**
 * The first usable FFmpeg: the `ffmpeg_path` preference, then `FFMPEG_BIN`,
 * then `ffmpeg` on PATH, then the places package managers and user installs
 * put it. A path below `minimumVersion` is rejected rather than accepted with
 * a warning: the conversion argument vectors assume current options.
 */
export async function findFFmpegPath(minimumVersion = 6.0): Promise<{ path: string; version: number } | null> {
  const preferences = getPreferenceValues();
  const customPath = typeof preferences.ffmpeg_path === "string" ? preferences.ffmpeg_path.trim() : "";
  const environmentPath = process.env.FFMPEG_BIN?.trim();
  const preferredPath = customPath || environmentPath;
  if (preferredPath) {
    const version = await checkFFmpegVersion(preferredPath);
    if (version !== null && version >= minimumVersion) return { path: preferredPath, version };
  }

  const onPath = await checkFFmpegVersion("ffmpeg");
  if (onPath !== null && onPath >= minimumVersion) return { path: "ffmpeg", version: onPath };

  const home = os.homedir();
  const candidates = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/bin/ffmpeg",
    "/snap/bin/ffmpeg",
    "/var/lib/flatpak/exports/bin/org.ffmpeg.FFmpeg",
    `${home}/.local/share/flatpak/exports/bin/org.ffmpeg.FFmpeg`,
    "/nix/var/nix/profiles/default/bin/ffmpeg",
    `${home}/.nix-profile/bin/ffmpeg`,
    "/run/current-system/sw/bin/ffmpeg",
    `${home}/.local/bin/ffmpeg`,
    `${home}/bin/ffmpeg`,
    "/opt/ffmpeg/bin/ffmpeg",
    "/usr/local/ffmpeg/bin/ffmpeg",
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = await checkFFmpegVersion(candidate);
    if (version !== null && version >= minimumVersion) return { path: candidate, version };
  }

  return null;
}
