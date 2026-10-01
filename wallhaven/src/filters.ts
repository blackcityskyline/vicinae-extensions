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

/**
 * A three-bit mask: general, anime, people — the order wallhaven uses, so a bitmask maps to
 * the query with no translation.
 */
export type CategoryBit = "100" | "010" | "001";
/**
 * `000` is deliberately absent. wallhaven answers it as though no category filter were sent at
 * all — measured, `categories=000` returns 104629 results, identical to `111` — so an empty
 * mask is not a state this extension can hold. `toggleCategory` refuses to produce one.
 */
export type CategoryValue = "111" | "110" | "101" | "011" | "100" | "010" | "001";
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
 * The three categories as separate toggles, not as seven presets.
 *
 * The website has one checkbox per category, and they are independent: unchecking Anime while
 * General stays checked narrows the results to General alone. Measured on wallhaven.cc:
 *
 *   categories=110  → total 73364,  page contains general and anime
 *   categories=100  → total 67086,  page contains general only
 *   categories=000  → total 104629, same as 111: an empty mask is not "nothing", it is ignored
 *
 * Offering the seven masks instead made the user pick a combination rather than tick boxes, and
 * the common case — "general, but not anime" — is a bitwise subtraction no preset expresses well.
 */
export const CATEGORIES: { title: string; bit: CategoryBit }[] = [
  { title: "General", bit: "100" },
  { title: "Anime", bit: "010" },
  { title: "People", bit: "001" },
];

/**
 * Add or remove one category bit.
 *
 * Unchecking the last one would send `categories=000`, which wallhaven answers as though no
 * category filter were given at all (104629 — everything, not nothing). So the last standing
 * category stays checked rather than handing back a mask that means the opposite of what the
 * user just did.
 */
/**
 * What selecting an item in the search-bar dropdown does.
 *
 * One dropdown holds four sections, and the dropdown reports only the item's value, never
 * which section it came from — so the values are prefixed with what they mean:
 * `cat:100` toggles the general bit, `sort:views` replaces the sort mode, `range:1M` replaces
 * the top range, `pur:110` replaces purity. An unrecognised prefix returns the state untouched
 * rather than throwing, because a value the runtime invented must not blank the search.
 */
export function applySelection(filters: Filters, selected: string): Filters {
  const separator = selected.indexOf(":");
  if (separator === -1) return filters;
  const kind = selected.slice(0, separator);
  const value = selected.slice(separator + 1);

  if (kind === "cat") return toggleCategory(filters, value as CategoryBit);
  if (kind === "pur") return withFilter(filters, "purity", value as Filters["purity"]);
  if (kind === "sort") return withFilter(filters, "sorting", value as Filters["sorting"]);
  if (kind === "range") return withFilter(filters, "topRange", value as Filters["topRange"]);
  return filters;
}

function bitIndex(bit: CategoryBit): number {
  return CATEGORIES.findIndex((category) => category.bit === bit);
}

export function toggleCategory(filters: Filters, bit: CategoryBit): Filters {
  const index = bitIndex(bit);
  if (index === -1) return filters;

  const mask = filters.categories.split("");
  mask[index] = mask[index] === "1" ? "0" : "1";
  const next = mask.join("");
  // Unchecked as a plain string on purpose: `000` is not in CategoryValue, and asking the
  // compiler about that is exactly the check this line exists to make.
  if (next === "000") return filters;
  return { ...filters, categories: next as CategoryValue };
}

/** Which of the three categories are currently on, for the checkmarks. */
export function isCategoryOn(filters: Filters, bit: CategoryBit): boolean {
  const index = bitIndex(bit);
  return index !== -1 && filters.categories[index] === "1";
}

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

/** A one-line summary of everything narrowing the search, for the tooltip. */
export function describeFilters(filters: Filters): string {
  const parts: string[] = [];
  for (const category of CATEGORIES) {
    if (isCategoryOn(filters, category.bit)) parts.push(category.title);
  }
  const sorting = SORTINGS.find((s) => s.value === filters.sorting);
  if (sorting) parts.push(sorting.title.toLowerCase());
  if (filters.sorting === "toplist") {
    const range = TOP_RANGES.find((r) => r.value === filters.topRange);
    if (range) parts.push(range.title.toLowerCase());
  }
  return parts.join(" · ");
}