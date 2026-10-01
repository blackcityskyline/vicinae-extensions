import { getPreferenceValues, environment } from "@raycast/api";
import { Wallpaper } from "@vicinae/api";
import { execFile, execFileSync } from "child_process";
import { createConnection } from "net";
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

  if (!backend) throw new Error(explainMissing());
  if (backend.viaVicinae) {
    // "Cover", not "stretch": it is the only fit every Vicinae backend can honour. macOS's
    // AppleScript filled the screen, so this is the closest equivalent, and the enum has no
    // "fill" (see `WallpaperFit` in @vicinae/api).
    await Wallpaper.set(imagePath, { fit: "Cover" });
    return;
  }
  // Every backend in the table has `apply` or `viaVicinae`, and a check in
  // test/backends.test.ts fails if that stops being true. The guard stays because it costs
  // one line and turns a future table edit into a message instead of a crash.
  if (!backend.apply) throw new Error(`${backend.label} has no command to change the wallpaper.`);

  for (const step of backend.apply(imagePath)) {
    if ("socket" in step) {
      await callSocket(backend.label, step.socket);
      continue;
    }
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

/**
 * One request, one reply, over a Unix socket. Skwd Wall frames its JSON one object per
 * line (`wall-proto/src/client.rs`), so reading stops at the newline.
 *
 * A missing socket is the common case and gets its own message, because "Skwd Wall is not
 * running" and "Skwd Wall rejected this" need different answers.
 */
function callSocket(
  label: string,
  socket: { path: string; payload: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket.path);
    let reply = "";

    const fail = (message: string) => {
      clearTimeout(timer);
      connection.destroy();
      reject(new Error(`${label}: ${message}`));
    };

    // A daemon that never answers would otherwise hang the action forever, which reads as
    // a frozen Vicinae rather than as a failure. Ten seconds is far longer than a local
    // socket round trip needs and far shorter than a user will wait.
    const timer = setTimeout(() => fail(`no reply from ${socket.path} within 10s`), 10_000);

    connection.setEncoding("utf8");
    connection.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        error.code === "ENOENT"
          ? `not reachable at ${socket.path}. Is it running?`
          : error.message,
      );
    });
    connection.on("connect", () => connection.write(socket.payload));
    connection.on("data", (chunk: string) => {
      reply += chunk;
      const newline = reply.indexOf("\n");
      if (newline === -1) return;
      try {
        const parsed = JSON.parse(reply.slice(0, newline));
        clearTimeout(timer);
        connection.destroy();
        if (parsed.error) reject(new Error(`${label}: ${parsed.error.message}`));
        else resolve();
      } catch {
        fail(`unreadable reply: ${reply.slice(0, newline)}`);
      }
    });
  });
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
