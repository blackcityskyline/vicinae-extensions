import type { Blocklist } from "~/utils/blocklist.ts";

export interface HistoryRow {
  url: string;
  title: string | null;
  /** `<bitmap id>-<last updated>` of the largest favicon, when a Favicons database was attached. */
  bitmap: string | null;
}

/** `%`, `_` and `\` are LIKE wildcards; the query uses `ESCAPE '\'`. */
function likeEscape(value: string): string {
  return value.replace(/'/g, "''").replace(/[\\%_]/g, "\\$&");
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Chrome's own frecency: visits and typed visits, decayed by how long ago the
 * page was last opened, tripled when the first typed word starts the host.
 */
function orderBy(words: readonly string[]): string {
  const hostMatch = words.length
    ? `CASE WHEN ${["https://", "http://", "https://www.", "http://www."]
        .map((prefix) => `url LIKE ${quote(`${prefix}${likeEscape(words[0] ?? "")}%`)} ESCAPE '\\'`)
        .join(" OR ")} THEN 3 ELSE 1 END`
    : "1";
  const days = "((strftime('%s', 'now') + 11644473600) * 1000000 - last_visit_time) / 86400000000.0";
  const recency = `CASE WHEN ${days} < 4 THEN 1.0 WHEN ${days} < 14 THEN 0.7 WHEN ${days} < 31 THEN 0.5
    WHEN ${days} < 90 THEN 0.3 ELSE 0.1 END`;
  return `ORDER BY (visit_count + 2 * typed_count) * ${recency} * ${hostMatch} DESC, last_visit_time DESC LIMIT 50`;
}

function filterOf(words: readonly string[], blocklist: Blocklist): string {
  const parts = ["hidden = 0"];
  for (const word of words) {
    const like = quote(`%${likeEscape(word)}%`);
    parts.push(`(url LIKE ${like} ESCAPE '\\' OR title LIKE ${like} ESCAPE '\\')`);
  }
  if (blocklist.urls.length > 0) {
    parts.push(`url NOT IN (${blocklist.urls.map(quote).join(",")})`);
  }
  for (const host of blocklist.hosts) {
    const escaped = likeEscape(host);
    parts.push(
      `NOT (url LIKE ${quote(`https://${escaped}/%`)} ESCAPE '\\' OR url LIKE ${quote(`http://${escaped}/%`)} ESCAPE '\\')`,
    );
  }
  return parts.join(" AND ");
}

/**
 * The suggestion query, run against a snapshot copy of the browser's `History`
 * database. With `withFavicons` the `Favicons` database must be attached as `f`.
 */
export function searchSql(words: readonly string[], blocklist: Blocklist, withFavicons: boolean): string {
  const columns = withFavicons
    ? `url, title, (SELECT b.id || '-' || b.last_updated FROM f.icon_mapping m
        JOIN f.favicon_bitmaps b ON b.icon_id = m.icon_id
        WHERE m.page_url = urls.url ORDER BY b.width DESC LIMIT 1) AS bitmap`
    : "url, title, NULL AS bitmap";
  return `SELECT ${columns} FROM urls WHERE ${filterOf(words, blocklist)} ${orderBy(words)}`;
}

export function faviconSql(ids: readonly number[]): string {
  return `SELECT id || '-' || last_updated AS key, hex(image_data) AS data FROM f.favicon_bitmaps WHERE id IN (${ids.join(",")})`;
}
