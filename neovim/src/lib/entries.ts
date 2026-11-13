/**
 * The two session sources, merged the way upstream merges them: persistence.nvim
 * files and the directories this extension opened, deduped on the path, newest
 * first. Pinned entries are the same shape, kept in `LocalStorage` as JSON.
 *
 * No `@vicinae/api` and no file reads here, so every rule below is testable
 * headless; `lib/sessions.ts` does the reading.
 */

export type Source = "persistence" | "recent";

export type Entry = {
  id: string;
  name: string;
  path: string;
  lastOpened: Date;
  source: Source;
  /** The persistence file `nvim -S` sources. Absent for a recent directory. */
  file?: string;
  /** A persistence session whose directory has been deleted since it was saved. */
  missing?: boolean;
};

/** Upstream caps its recent list at 50; older entries fall off. */
const RECENT_LIMIT = 50;

/** `~/.dotfiles` for `/home/someone/.dotfiles`, without a dependency. */
function nameOf(directory: string): string {
  const trimmed = directory.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1) || trimmed;
}

function newestFirst(left: Entry, right: Entry): number {
  return right.lastOpened.getTime() - left.lastOpened.getTime();
}

/**
 * Persistence first, so a session file wins over the recent entry for the same
 * directory: it has the layout to restore.
 */
export function mergeSessions(...sources: Entry[][]): Entry[] {
  const seen = new Set<string>();
  const merged: Entry[] = [];

  for (const source of sources) {
    for (const entry of source) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      merged.push(entry);
    }
  }

  return merged.sort(newestFirst);
}

/** A directory opened from the extension is promoted to the front, and capped. */
export function trackRecent(recent: Entry[], directory: string, when: Date): Entry[] {
  const entry: Entry = {
    id: `recent:${directory}`,
    name: nameOf(directory),
    path: directory,
    lastOpened: when,
    source: "recent",
  };
  return [entry, ...recent.filter((candidate) => candidate.path !== directory)].slice(0, RECENT_LIMIT);
}

export function removeRecent(recent: Entry[], path: string): Entry[] {
  return recent.filter((entry) => entry.path !== path);
}

/** `LocalStorage` hands back `null` for an absent key, and any JSON at all for a corrupt one. */
export function parsePinned(raw: string | null | undefined): Entry[] {
  if (raw === null || raw === undefined || raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: Entry[] = [];
  for (const item of parsed) {
    if (item === null || typeof item !== "object") continue;
    const value = item as { path?: unknown; name?: unknown; lastOpened?: unknown; source?: unknown; file?: unknown };
    if (typeof value.path !== "string" || value.path === "") continue;

    const when = typeof value.lastOpened === "string" ? new Date(value.lastOpened) : new Date(0);
    const source: Source = value.source === "persistence" ? "persistence" : "recent";
    entries.push({
      id: `${source}:${value.path}`,
      name: typeof value.name === "string" && value.name !== "" ? value.name : nameOf(value.path),
      path: value.path,
      lastOpened: Number.isNaN(when.getTime()) ? new Date(0) : when,
      source,
      ...(source === "persistence" && typeof value.file === "string" ? { file: value.file } : {}),
    });
  }
  return entries;
}

export function serializePinned(entries: Entry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      path: entry.path,
      name: entry.name,
      lastOpened: entry.lastOpened.toISOString(),
      source: entry.source,
      ...(entry.file === undefined ? {} : { file: entry.file }),
    })),
  );
}

export function pin(entries: Entry[], entry: Entry): Entry[] {
  if (entries.some((candidate) => candidate.path === entry.path)) return entries;
  return [...entries, entry];
}

export function unpin(entries: Entry[], path: string): Entry[] {
  return entries.filter((entry) => entry.path !== path);
}

/** Move a pinned entry by `delta` rows; at an edge, the list is returned untouched. */
export function movePinned(entries: Entry[], path: string, delta: -1 | 1): Entry[] {
  const index = entries.findIndex((entry) => entry.path === path);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= entries.length) return entries;

  const next = [...entries];
  [next[index], next[target]] = [next[target] as Entry, next[index] as Entry];
  return next;
}

export function movements(entries: Entry[], path: string): Array<"up" | "down"> {
  const index = entries.findIndex((entry) => entry.path === path);
  if (index === -1) return [];
  const allowed: Array<"up" | "down"> = [];
  if (index > 0) allowed.push("up");
  if (index < entries.length - 1) allowed.push("down");
  return allowed;
}
