import { execFile } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { isInside, type Download } from "~/utils/downloads";

export type FilesResult = { ok: true } | { ok: false; message: string };

export type FilesystemRead = { ok: true; value: Download[] } | { ok: false; message: string };

/** Newest first, folders and files alike; a folder has no meaningful size. */
export async function readDownloads(folder: string): Promise<FilesystemRead> {
  const root = resolve(folder);
  let names: string[];
  try {
    names = await readdir(root);
  } catch (error) {
    return { ok: false, message: `${root} could not be read: ${(error as Error).message}` };
  }

  const downloads = await Promise.all(
    names
      .filter((name) => !name.startsWith("."))
      .map(async (name): Promise<Download | null> => {
        const path = join(root, name);
        try {
          const stats = await stat(path);
          return {
            name,
            path,
            isDirectory: stats.isDirectory(),
            size: stats.isDirectory() ? 0 : stats.size,
            modifiedAt: stats.mtime,
          };
        } catch {
          // A broken symlink, or a file that went away while it was being
          // listed. Neither is worth failing the whole listing over.
          return null;
        }
      }),
  );

  const found = downloads.filter((entry): entry is Download => entry !== null);
  found.sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
  return { ok: true, value: found };
}

/**
 * Refuses anything not strictly below the folder, so a path that somehow came
 * from outside the listing cannot be deleted through it.
 */
function guarded(folder: string, path: string): FilesResult | null {
  if (isInside(folder, path)) return null;
  return { ok: false, message: `${path} is not inside ${resolve(folder)}, so it was left alone.` };
}

const NO_GIO =
  "gio was not found. It is part of glib2 and is what moves a file to the trash on Linux.";

/**
 * Moves a file to the freedesktop.org trash, so it stays recoverable.
 *
 * `trash()` from `@vicinae/api` is a recursive `rm` under a friendly name, and
 * `gio` is the real thing: it writes the `.trashinfo` record the desktop trash
 * expects. It refuses files on an internal mount such as `/tmp`, which is the
 * caller-visible half of why `Delete Permanently` exists as a separate action.
 */
export async function moveToTrash(folder: string, path: string): Promise<FilesResult> {
  const refusal = guarded(folder, path);
  if (refusal) return refusal;

  return new Promise((resolveResult) => {
    execFile("gio", ["trash", path], { timeout: 20_000 }, (error, _stdout, stderr) => {
      if (!error) return resolveResult({ ok: true });
      const failure = error as NodeJS.ErrnoException;
      resolveResult({
        ok: false,
        message:
          failure.code === "ENOENT"
            ? NO_GIO
            : stderr.trim() || `gio trash failed: ${failure.message}`,
      });
    });
  });
}

export async function deletePermanently(folder: string, path: string): Promise<FilesResult> {
  const refusal = guarded(folder, path);
  if (refusal) return refusal;

  try {
    await rm(path, { recursive: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
