import { getPreferenceValues, environment } from "@raycast/api";
import { Wallpaper } from "@vicinae/api";
import { execFile, execFileSync } from "child_process";
import { writeFile } from "fs/promises";
import { join } from "path";

import { detectBackend, explainMissing, findBackend, type Backend, type BackendId } from "./backends";

export async function downloadImage(
  url: string,
  destPath: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));
}

/**
 * Upstream sets the wallpaper with `runAppleScript`, telling System Events to put a
 * picture on every desktop. That is macOS only, and the library behind it throws here.
 *
 * `Wallpaper.set` alone is not enough either. It drives seven backends, and on this
 * machine none of them is installed — Noctalia draws the wallpaper itself, with no
 * `swww`/`awww`/`hyprpaper` binary anywhere — so it fails with "neither awww nor swww is
 * installed", which is true and beside the point. So: detect what is actually running,
 * then use that backend's own interface. See `backends.ts` for the full reasoning.
 *
 * `allDesktops` is dropped rather than mapped. Every backend here sets every output —
 * Noctalia takes an optional connector and `swww img` has no per-monitor flag at all — so
 * "current desktop only" is not expressible, and the action that used it is gone rather
 * than quietly doing the other thing.
 */

/** Resolve the backend to use: the preference if it names one, otherwise what is running. */
async function resolveBackend(): Promise<Backend | undefined> {
  const { backend } = getPreferenceValues<Preferences>();
  if (backend && backend !== "auto") {
    // The dropdown can hold a stale value after the table changes; an unknown one falls
    // through to detection instead of failing.
    const chosen = findBackend(backend as BackendId);
    if (chosen) return chosen;
  }
  // Synchronous because there is nothing to await it alongside: the result is needed before
  // the next line runs, and `ps` on 300-odd processes takes single-digit milliseconds.
  const names = execFileSync("ps", ["-eo", "comm="], { encoding: "utf8" });
  return detectBackend(names.split("\n").map((line) => line.trim()));
}

export async function setDesktopWallpaper(imagePath: string): Promise<void> {
  const backend = await resolveBackend();

  if (!backend) throw new Error(explainMissing(undefined));
  if (backend.viaVicinae) {
    // "Cover", not "stretch": it is the only fit every Vicinae backend can honour. macOS's
    // AppleScript filled the screen, so this is the closest equivalent, and the enum has no
    // "fill" (see `WallpaperFit` in @vicinae/api).
    await Wallpaper.set(imagePath, { fit: "Cover" });
    return;
  }
  if (!backend.apply) throw new Error(explainMissing(backend));

  for (const step of backend.apply(imagePath)) {
    await new Promise<void>((resolve, reject) => {
      // `detached` is for daemons like swaybg's second instance, which never exit; without
      // it the command hangs until the extension is killed.
      const child = execFile(step.argv[0], step.argv.slice(1), (error) => {
        if (error) reject(new Error(`${backend.label}: ${error.message}`));
        else resolve();
      });
      if (step.detached) child.unref();
    });
  }
}

export function getTempFilePath(filename: string): string {
  return join(environment.supportPath, filename);
}

export function getFileExtension(url: string): string {
  const match = url.match(/\.(\w+)(?:\?|$)/);
  return match ? match[1] : "jpg";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function purityColor(purity: string): string {
  switch (purity) {
    case "sfw":
      return "#4CAF50";
    case "sketchy":
      return "#FF9800";
    case "nsfw":
      return "#F44336";
    default:
      return "#999999";
  }
}
