import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cacheDir } from "~/lib/browser";

/**
 * One picture per tab URL, overwritten in place. The screenshot is not free —
 * the add-on reloads a discarded tab and waits for it to paint, which measured
 * 0.1 s for a warm tab and 5 s for a cold one — so a row that was seen recently
 * shows the picture it already has while a new one is taken behind it.
 */
export const FRESH_MS = 15_000;
/** A week of previews is a few hundred files; older ones are nobody's tab. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function thumbnailDir(): string {
  return join(cacheDir(), "screenshots");
}

/** The URL, not the tab id: a reloaded tab keeps its id, a new tab takes an old one. */
function fileName(url: string): string {
  return `${createHash("sha1").update(url).digest("hex")}.png`;
}

/** The cached picture for `url`, if a previous preview wrote one. */
export function thumbnailFor(url: string): string | null {
  const file = join(thumbnailDir(), fileName(url));
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** Whether `file` is recent enough to show without asking the add-on again. */
export function freshScreenshot(file: string, now: number = Date.now()): boolean {
  try {
    return now - statSync(file).mtimeMs < FRESH_MS;
  } catch {
    return false;
  }
}

/**
 * Writes the picture for `url` under the cache directory. A temp name and a
 * rename keep a reader of the old file from seeing a half-written PNG.
 */
export function rememberScreenshot(url: string, data: Buffer): string {
  mkdirSync(thumbnailDir(), { recursive: true });
  const file = join(thumbnailDir(), fileName(url));
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, data);
  renameSync(temp, file);
  prune(thumbnailDir());
  return file;
}

/** Drops previews nobody has asked for in a week; a failed stat is not worth a toast. */
function prune(dir: string, now: number = Date.now()): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const file = join(dir, entry);
    try {
      if (now - statSync(file).mtimeMs > KEEP_MS) rmSync(file, { force: true });
    } catch {
      // Deleted by another capture, or a directory: nothing to prune.
    }
  }
}
