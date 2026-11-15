import { IMPACTS, type Impact } from "~/api/feed";

/** What the user chose to see. An empty list means no restriction, so the default shows everything. */
export type Filters = { impacts: Impact[]; currencies: string[] };

export const NO_FILTERS: Filters = { impacts: [], currencies: [] };

export const isFiltered = (filters: Filters): boolean => filters.impacts.length > 0 || filters.currencies.length > 0;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** Reads a saved filter back; anything that is not one gives no restriction rather than an error. */
export function parseFilters(raw: string | undefined): Filters {
  if (!raw) return NO_FILTERS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NO_FILTERS;
  }
  if (typeof json !== "object" || json === null) return NO_FILTERS;
  const saved = json as Record<string, unknown>;
  const currencies = [...new Set(strings(saved.currencies).map((code) => code.toUpperCase()))];
  const impacts = IMPACTS.filter((level) => strings(saved.impacts).includes(level));
  return { impacts, currencies };
}

export function describeFilters(filters: Filters): string {
  return [filters.impacts.join(", "), filters.currencies.join(", ")].filter(Boolean).join(" · ");
}
