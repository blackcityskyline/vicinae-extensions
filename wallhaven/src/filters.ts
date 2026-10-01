/**
 * The filter and sort choices for a wallhaven search.
 *
 * Upstream kept these as four independent `useState` strings behind one dropdown whose
 * `value` was a `"kind:value"` pair like `"sort:relevance"`. That is what made them feel
 * exclusive: one dropdown has one selected item, so picking a category looked like it
 * cleared the sort mode, and picking a sort mode looked like it cleared the category. The
 * API never required a choice — it takes all of them at once (see `buildSearchQuery`).
 *
 * So the state is modelled as one object, and each control is a separate dropdown bound to
 * one field. Two independent dropdowns cannot cancel each other out, because neither knows
 * the other exists. Pure and free of React so the rules can be checked directly.
 */

export type CategoryValue = "111" | "100" | "010" | "001" | "110" | "101" | "011";
export type PurityValue = "100" | "110" | "111";
export type SortingValue =
  | "date_added"
  | "relevance"
  | "random"
  | "views"
  | "favorites"
  | "toplist";
export type TopRangeValue = "1d" | "3d" | "1w" | "1M" | "3M" | "6M" | "1y";

export type Filters = {
  categories: CategoryValue;
  purity: PurityValue;
  sorting: SortingValue;
  topRange: TopRangeValue;
};

export const DEFAULT_FILTERS: Filters = {
  categories: "111",
  purity: "100",
  sorting: "date_added",
  topRange: "1M",
};

/**
 * Categories are a three-bit mask — general, anime, people — and the API wants all
 * combinations, so all seven are offered rather than a "none" that would need to be encoded
 * as an empty string.
 */
export const CATEGORIES: { title: string; value: CategoryValue }[] = [
  { title: "All", value: "111" },
  { title: "General", value: "100" },
  { title: "Anime", value: "010" },
  { title: "People", value: "001" },
  { title: "General + Anime", value: "110" },
  { title: "General + People", value: "101" },
  { title: "Anime + People", value: "011" },
];

export const PURITIES: { title: string; value: PurityValue }[] = [
  { title: "SFW", value: "100" },
  { title: "SFW + Sketchy", value: "110" },
  { title: "All (incl. NSFW)", value: "111" },
];

export const SORTINGS: { title: string; value: SortingValue }[] = [
  { title: "Date Added", value: "date_added" },
  { title: "Relevance", value: "relevance" },
  { title: "Random", value: "random" },
  { title: "Views", value: "views" },
  { title: "Favorites", value: "favorites" },
  { title: "Toplist", value: "toplist" },
];

export const TOP_RANGES: { title: string; value: TopRangeValue }[] = [
  { title: "Last Day", value: "1d" },
  { title: "Last 3 Days", value: "3d" },
  { title: "Last Week", value: "1w" },
  { title: "Last Month", value: "1M" },
  { title: "Last 3 Months", value: "3M" },
  { title: "Last 6 Months", value: "6M" },
  { title: "Last Year", value: "1y" },
];

/** Change one field, leaving the rest alone. This is the whole point of the file. */
export function withFilter<K extends keyof Filters>(
  filters: Filters,
  key: K,
  value: Filters[K],
): Filters {
  return { ...filters, [key]: value };
}

/**
 * What to send, given the safe-search preference.
 *
 * `sfwOnly` wins over the purity choice, as it did upstream: it is a promise that NSFW
 * results never appear, and a purity dropdown that could override it would not be a
 * promise. With it on, the dropdown is not rendered at all.
 */
export function toSearchParams(
  filters: Filters,
  options: { query: string; sfwOnly: boolean; page: number; seed?: string },
): { categories: string; purity: string; sorting: string; topRange?: string; q?: string; page: number; seed?: string } {
  return {
    q: options.query || undefined,
    categories: filters.categories,
    purity: options.sfwOnly ? "100" : filters.purity,
    sorting: filters.sorting,
    topRange: filters.sorting === "toplist" ? filters.topRange : undefined,
    page: options.page,
    seed: filters.sorting === "random" ? options.seed : undefined,
  };
}

/** What the range dropdown should read, for the tooltip on the sorting control. */
export function describeFilters(filters: Filters): string {
  const parts: string[] = [];
  const category = CATEGORIES.find((c) => c.value === filters.categories);
  const sorting = SORTINGS.find((s) => s.value === filters.sorting);
  if (category && category.value !== "111") parts.push(category.title);
  if (sorting) parts.push(sorting.title.toLowerCase());
  if (filters.sorting === "toplist") {
    const range = TOP_RANGES.find((r) => r.value === filters.topRange);
    if (range) parts.push(range.title.toLowerCase());
  }
  return parts.join(" · ");
}