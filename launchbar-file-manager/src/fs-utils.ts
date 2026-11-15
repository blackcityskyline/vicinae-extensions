import { promises as fs, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type FileEntry = {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  extension: string;
};

export function expandHome(p: string): string {
  if (!p) return os.homedir();
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function listDir(
  dirPath: string,
  showHidden: boolean,
): Promise<FileEntry[]> {
  const names = await fs.readdir(dirPath);
  const entries: FileEntry[] = [];
  for (const name of names) {
    if (!showHidden && name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, name);
    try {
      const stat = await fs.stat(fullPath);
      entries.push({
        name,
        fullPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        mtime: stat.mtime,
        extension: path.extname(name).toLowerCase(),
      });
    } catch {
      // skip unreadable / broken symlinks
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return entries;
}

export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return "Folder";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parentDir(p: string): string {
  const parent = path.dirname(p);
  return parent === p ? p : parent;
}

export function fileKind(entry: FileEntry): string {
  if (entry.isDirectory) return "Folder";
  if (!entry.extension) return "File";
  return `${entry.extension.replace(".", "").toUpperCase()} file`;
}

/**
 * `xdg-user-dirs` names the home folders in the user's language and stores them
 * in user-dirs.dirs — a machine with a non-English locale may have no
 * `~/Downloads` at all, so that file is the only reliable source.
 */
export function parseUserDirs(
  text: string,
  home: string,
): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\s*(XDG_[A-Z]+_DIR)\s*=\s*"(.*)"\s*$/.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || !value) continue;
    dirs.set(key, value.replace(/^\$HOME/, home));
  }
  return dirs;
}

function loadFavorites(): { title: string; path: string }[] {
  const home = os.homedir();
  const file = path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"),
    "user-dirs.dirs",
  );
  const dirs = parseUserDirs(readFileSync(file, "utf8"), home);
  const named: [string, string][] = [
    ["Desktop", "XDG_DESKTOP_DIR"],
    ["Documents", "XDG_DOCUMENTS_DIR"],
    ["Downloads", "XDG_DOWNLOAD_DIR"],
  ];
  const entries: { title: string; path: string }[] = [
    { title: "Home", path: home },
  ];
  for (const [title, key] of named) {
    const found = dirs.get(key);
    if (!found || found === home) continue;
    try {
      if (!statSync(found).isDirectory()) continue;
    } catch {
      continue;
    }
    entries.push({ title, path: found });
  }
  entries.push({ title: "/", path: "/" });
  return entries;
}

// Read once per command start: the launcher spawns a worker, so this is a single
// small file read, not per render.
export const FAVORITES = loadFavorites();
