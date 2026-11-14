import { withSnapshot } from "~/lib/browser";

/** One page of a paged list: the rows and whether another page exists. */
export type Page<T> = {
  items: T[];
  hasMore: boolean;
};

export type HistoryHit = {
  url: string;
  title: string;
  /** Milliseconds since the epoch. */
  lastVisit: number;
  visits: number;
};

export type Bookmark = {
  title: string;
  url: string;
  /** `Bookmarks Toolbar/Dev`; empty at the root. */
  folder: string;
  /** Milliseconds since the epoch. */
  addedAt: number;
};

/** `LIKE` metacharacters in a user's query are text, not wildcards. */
function contains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * A page of the browser's history, newest visit first. `LIKE` in SQLite folds
 * case for ASCII only, so a Cyrillic query matches case-sensitively; that is the
 * database's rule, not a choice made here.
 */
export function historyPage(profile: string, query: string, limit = 50, offset = 0): Page<HistoryHit> {
  const text = query.trim();
  const filter = text === "" ? "" : `AND (p.url LIKE ? ESCAPE '\\' OR COALESCE(p.title, '') LIKE ? ESCAPE '\\')`;
  const params = text === "" ? [] : [contains(text), contains(text)];

  return withSnapshot(profile, (database) => {
    const rows = database
      .prepare(
        `SELECT p.url AS url,
                COALESCE(p.title, '') AS title,
                MAX(v.visit_date) AS lastVisit,
                COUNT(*) AS visits
           FROM moz_places p
           JOIN moz_historyvisits v ON v.place_id = p.id
          WHERE p.url NOT LIKE 'place:%'
            ${filter}
          GROUP BY p.id
          ORDER BY lastVisit DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, offset) as { url: string; title: string; lastVisit: number; visits: number }[];

    const hits = rows.slice(0, limit).map((row) => ({
      url: row.url,
      title: row.title || row.url,
      // visit_date is microseconds since the epoch; the lists show milliseconds.
      lastVisit: Math.round(row.lastVisit / 1000),
      visits: row.visits,
    }));

    return { items: hits, hasMore: rows.length > limit };
  });
}

type FolderRow = { id: number; parent: number; title: string };

/** Walks each folder's parent chain into `Bookmarks Toolbar/Dev` style paths. */
function folderPaths(folders: FolderRow[]): Map<number, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<number, string>();

  const pathOf = (id: number, depth = 0): string => {
    const seen = paths.get(id);
    if (seen !== undefined) return seen;
    // A malformed tree must not recurse forever; Firefox's own is three levels deep.
    if (depth > 16) return "";

    const folder = byId.get(id);
    if (!folder) return "";
    const path = [pathOf(folder.parent, depth + 1), folder.title.trim()]
      .filter((part) => part !== "" && part !== "root")
      .join("/");
    paths.set(id, path);
    return path;
  };

  for (const folder of folders) pathOf(folder.id);
  return paths;
}

/**
 * Bookmarks live in `moz_bookmarks` beside the history in `places.sqlite`; a
 * bookmark row points at its page through `fk`. Folders are rows without an
 * `fk`, so the folder path is walked from the folder titles.
 */
export function bookmarksPage(profile: string, query: string, limit = 50, offset = 0): Page<Bookmark> {
  const text = query.trim();
  const filter =
    text === ""
      ? ""
      : `AND (COALESCE(b.title, '') LIKE ? ESCAPE '\\' OR COALESCE(p.title, '') LIKE ? ESCAPE '\\' OR p.url LIKE ? ESCAPE '\\')`;
  const params = text === "" ? [] : [contains(text), contains(text), contains(text)];

  return withSnapshot(profile, (database) => {
    const folders = database
      .prepare(`SELECT id, parent, COALESCE(title, '') AS title FROM moz_bookmarks WHERE type = 2`)
      .all() as FolderRow[];
    const paths = folderPaths(folders);

    const rows = database
      .prepare(
        `SELECT b.parent AS parent,
                COALESCE(b.title, '') AS bookmarkTitle,
                COALESCE(p.title, '') AS pageTitle,
                p.url AS url,
                b.dateAdded AS addedAt
           FROM moz_bookmarks b
           JOIN moz_places p ON p.id = b.fk
          WHERE b.type = 1
            AND p.url NOT LIKE 'place:%'
            ${filter}
          ORDER BY b.dateAdded DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, offset) as {
      parent: number;
      bookmarkTitle: string;
      pageTitle: string;
      url: string;
      addedAt: number;
    }[];

    const items = rows.slice(0, limit).map((row) => ({
      title: row.bookmarkTitle || row.pageTitle || row.url,
      url: row.url,
      folder: paths.get(row.parent) ?? "",
      addedAt: Math.round(row.addedAt / 1000),
    }));

    return { items, hasMore: rows.length > limit };
  });
}
