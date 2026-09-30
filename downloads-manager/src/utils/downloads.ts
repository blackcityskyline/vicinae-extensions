import { isAbsolute, relative, resolve } from "node:path";

export type Download = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
};

/**
 * Whether `candidate` is strictly below `root`.
 *
 * Every destructive action asks this first. The path comes out of a directory
 * listing, and a listing can hand back a path outside the folder it came from:
 * a symlink pointing at `~/.ssh`, an entry named `..` after some interleaving.
 * `startsWith` is not enough — `/home/black/Downloads2` starts with
 * `/home/black/Downloads` as a string and is a different directory — so the
 * comparison is made on the relative path, which resolves `..` on the way.
 */
export function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  // parseFloat drops the trailing zeroes `toFixed` would leave behind.
  return `${parseFloat((bytes / 1024 ** unit).toFixed(2))} ${UNITS[unit]}`;
}
