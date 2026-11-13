/**
 * The list's rules that do not need a daemon: how the preferences are read, and
 * the four orderings upstream offers. Pure, so the tests can pin them.
 */

import type { Torrent } from "~/api/rpc";

export type SortBy = "progress" | "name" | "status" | "addedDate";
export type Direction = "asc" | "desc";

const SORT_BY: SortBy[] = ["progress", "name", "status", "addedDate"];

export function parseSortBy(value: string | undefined): SortBy {
  return SORT_BY.find((candidate) => candidate === value) ?? "progress";
}

export function parseDirection(value: string | undefined): Direction {
  return value === "asc" ? "asc" : "desc";
}

function compare(left: Torrent, right: Torrent, by: SortBy): number {
  switch (by) {
    case "name":
      return left.name.localeCompare(right.name);
    case "status":
      return left.status - right.status;
    case "addedDate":
      return left.addedDate - right.addedDate;
    case "progress":
      return left.percentDone - right.percentDone;
  }
}

/** The chosen key, then the direction; equal keys fall back to the name. */
export function sortTorrents(torrents: Torrent[], by: SortBy, direction: Direction): Torrent[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...torrents].sort(
    (left, right) => compare(left, right, by) * sign || left.name.localeCompare(right.name),
  );
}

/** Upstream clamps the preference to 0–100 and treats nonsense as 20. */
export function maxFilesShown(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(100, Math.max(0, parsed));
}

/** A comma-separated preference; empty pieces are not paths. */
export function quickPaths(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path !== "");
}
