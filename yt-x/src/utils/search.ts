/** YouTube's search filters, exactly as yt-x's `_parse_search_filter` spells them. */
const FILTERS: Record<string, string> = {
  hour: "EgIIAQ%253D%253D",
  today: "EgIIAg%253D%253D",
  week: "EgIIAw%253D%253D",
  month: "EgIIBA%253D%253D",
  year: "EgIIBQ%253D%253D",
  video: "EgIQAQ%253D%253D",
  movie: "EgIQBA%253D%253D",
  live: "EgJAAQ%253D%253D",
  short: "EgQQARgB",
  long: "EgQQARgC",
  "4k": "EgJwAQ%253D%253D",
  hd: "EgIgAQ%253D%253D",
  subtitles: "EgIoAQ%253D%253D",
  "360": "EgJ4AQ%253D%253D",
  vr: "EgLIAQ%253D%253D",
  "3d": "EgI4AQ%253D%253D",
  hdr: "EgPIAQ%253D%253D",
  local: "EgO4AQ%253D%253D",
  newest: "CAISAhAB",
  views: "CAMSAhAB",
  rating: "CAESAhAB",
};

export const DEFAULT_SP = FILTERS.video!;

export type AppliedSearch = {
  term: string;
  sp: string;
};

/**
 * Pull `:today`, `:4k`, `:newest` and the rest out of a search line, the way
 * yt-x does: as the first word or as the last one.
 */
export function applySearchFilters(input: string): AppliedSearch {
  const original = input.trim();
  let term = original;
  let sp = DEFAULT_SP;
  let applied = false;

  if (term.startsWith(":")) {
    const [head, ...rest] = term.split(/\s+/);
    const filter = head!.slice(1);
    if (filter in FILTERS) {
      sp = FILTERS[filter]!;
      term = rest.join(" ");
      applied = true;
    }
  }

  if (!applied) {
    const match = /(?:^|\s):([^\s]+)$/.exec(term);
    const filter = match?.[1];
    if (match && filter && filter in FILTERS) {
      sp = FILTERS[filter]!;
      term = term.slice(0, match.index).trim();
      applied = true;
    }
  }

  // A lone filter keeps its text, as yt-x does, so the search still runs.
  if (applied && term === "") return { term: original, sp: DEFAULT_SP };
  return { term, sp };
}

/**
 * Expand `!1`, `!2`, … to a past search. `!1` is the newest entry, matching
 * yt-x's search history recall.
 */
export function expandHistoryRecall(input: string, history: readonly string[]): string {
  const term = input.trim();
  const match = /^!(\d+)\s*(.*)$/.exec(term);
  if (!match) return term;

  const index = Number(match[1]);
  const entry = history[history.length - index];
  if (!entry) return term;

  return `${entry} ${match[2] ?? ""}`.trim();
}

/** yt-x searches YouTube as a playlist listing, so results paginate too. */
export function searchUrl(term: string, sp: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}&sp=${sp}`;
}
