import { promises as fs, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

export type FileEntry = {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  extension: string;
  /** A symlink row is marked even when its target is a folder. */
  isSymlink: boolean;
  /** A symlink whose target does not resolve: still listed, not enterable. */
  broken: boolean;
  /** Absolute target of a symlink, when it can be read. */
  linkTarget?: string;
  /** Permission bits as octal, e.g. "644"; the target's bits for a link. */
  permissions: string;
};

export function expandHome(p: string): string {
  if (!p) return os.homedir();
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * `git check-ignore` is the authority on .gitignore, including nested files,
 * negations and the user's global excludes — a hand-rolled matcher gets those
 * wrong. One batch call per folder listing, and only when the setting is on.
 */
function ignoredNames(
  dirPath: string,
  names: string[],
): Promise<Set<string>> {
  if (names.length === 0) return Promise.resolve(new Set());
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["-C", dirPath, "check-ignore", "--no-index", "-z", "--stdin"],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    // No git, or not a repository: show everything.
    child.on("error", () => resolve(new Set()));
    child.on("close", (code) => {
      if (code !== 0 && code !== 1) {
        resolve(new Set());
        return;
      }
      resolve(
        new Set(
          out
            .split("\0")
            .filter(Boolean)
            .map((p) => p.replace(/\/+$/, "").replace(/^\.\//, "")),
        ),
      );
    });
    child.stdin.end(names.join("\0") + "\0");
  });
}

export async function listDir(
  dirPath: string,
  showHidden: boolean,
  respectGitignore = false,
): Promise<FileEntry[]> {
  let names = await fs.readdir(dirPath);
  if (!showHidden) names = names.filter((name) => !name.startsWith("."));
  if (respectGitignore) {
    const ignored = await ignoredNames(dirPath, names);
    names = names.filter((name) => !ignored.has(name));
  }

  const entries: FileEntry[] = [];
  for (const name of names) {
    const fullPath = path.join(dirPath, name);
    try {
      const lstat = await fs.lstat(fullPath);
      const isSymlink = lstat.isSymbolicLink();
      let stat = lstat;
      let broken = false;
      let linkTarget: string | undefined;
      if (isSymlink) {
        try {
          linkTarget = path.resolve(dirPath, await fs.readlink(fullPath));
          stat = await fs.stat(fullPath);
        } catch {
          broken = true;
        }
      }
      entries.push({
        name,
        fullPath,
        isDirectory: !broken && stat.isDirectory(),
        size: stat.size,
        mtime: stat.mtime,
        extension: path.extname(name).toLowerCase(),
        isSymlink,
        broken,
        linkTarget,
        permissions: (stat.mode & 0o777).toString(8).padStart(3, "0"),
      });
    } catch {
      // skip unreadable entries
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
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

export function tildifyPath(p: string, home = os.homedir()): string {
  if (p === home) return "~";
  if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
  return p;
}

export function fileKind(entry: FileEntry): string {
  if (entry.broken) return "Broken link";
  if (entry.isSymlink) {
    return entry.isDirectory ? "Link to folder" : "Link to file";
  }
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
