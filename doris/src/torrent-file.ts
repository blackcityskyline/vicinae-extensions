import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TrackedRow } from "~/api/doris";

/**
 * The one URL that can be saved without doris's help: an absolute link to the
 * `.torrent` itself. Rows whose source answers with a relative `dl.php?t=…`
 * (rutracker) or with no URL at all (yts, tpb: magnet only) are left alone —
 * fetching those needs the source's own base and, on rutracker, the browser
 * session doris already holds.
 */
export function absoluteTorrentUrl(row: TrackedRow): string | null {
  return /^https?:\/\//i.test(row.download_url) ? row.download_url : null;
}

/** A name every filesystem accepts: no separators, no control characters. */
export function torrentFileName(title: string): string {
  const base =
    title
      .replace(/[/\\\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .replace(/[. ]+$/, "") || "torrent";
  return `${base}.torrent`;
}

/** `XDG_DOWNLOAD_DIR` when the user redefined it, else `~/Downloads`. */
export function downloadsDir(): string {
  try {
    const config = readFileSync(
      join(homedir(), ".config", "user-dirs.dirs"),
      "utf8",
    );
    const match = /^XDG_DOWNLOAD_DIR="(.*)"$/m.exec(config);
    if (match?.[1]) return match[1].replace(/^\$HOME/, homedir());
  } catch {
    // No user-dirs.dirs: the default below is right.
  }
  return join(homedir(), "Downloads");
}

/** Never overwrite: the same release saved twice gets a numbered name. */
function freePath(directory: string, name: string): string {
  const candidate = join(directory, name);
  if (!existsSync(candidate)) return candidate;
  const stem = name.replace(/\.torrent$/, "");
  for (let copy = 2; copy < 100; copy++) {
    const next = join(directory, `${stem} (${copy}).torrent`);
    if (!existsSync(next)) return next;
  }
  throw new Error(`${directory} already holds 99 copies of ${name}.`);
}

export async function saveTorrentFile(
  url: string,
  title: string,
): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`The tracker answered ${response.status} for that .torrent.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  // A torrent is one bencoded dict and starts with `d8:announce` or a shorter
  // `d4:info`; an HTML answer is a login page and must not be saved as if it
  // were the file.
  if (bytes.length === 0 || bytes.subarray(0, 1).toString() !== "d") {
    throw new Error("The tracker answered with a web page, not a .torrent file.");
  }
  const directory = downloadsDir();
  await mkdir(directory, { recursive: true });
  const path = freePath(directory, torrentFileName(title));
  await writeFile(path, bytes);
  return path;
}
