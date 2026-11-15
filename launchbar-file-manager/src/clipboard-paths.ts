import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Paths in the clipboard as a file manager writes them.
 *
 * A "copy" in Nautilus, Dolphin or Thunar puts `text/uri-list` on the
 * clipboard: one `file:///…` URI per line, percent-encoded. Vicinae hands the
 * text over, so the URIs are decoded here. Plain paths are accepted as well,
 * one per line, `~` included — that is what a terminal `ls`/`pwd` copy or a
 * note looks like.
 */
export function clipboardPaths(text: string, home = os.homedir()): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const decoded = decode(line, home);
    if (decoded) seen.add(decoded);
  }
  return [...seen];
}

function decode(line: string, home: string): string | null {
  if (line.startsWith("file://")) {
    try {
      // file://host/path is legal; only the local host makes sense here.
      const url = new URL(line);
      if (url.host && url.host !== "localhost") return null;
      return decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  }
  // Anything with a scheme (https:, mailto:, …) is not a path.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) return null;
  if (line === "~") return home;
  if (line.startsWith("~/")) return path.join(home, line.slice(2));
  return path.isAbsolute(line) ? line : null;
}

/** Only the paths that still exist; a moved or stale entry is dropped, not failed. */
export async function existingPaths(paths: string[]): Promise<string[]> {
  const checks = await Promise.all(
    paths.map(async (p) =>
      fs.access(p).then(
        () => p,
        () => null,
      ),
    ),
  );
  return checks.filter((p): p is string => p !== null);
}
