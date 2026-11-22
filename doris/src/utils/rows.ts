import type { TrackedRow } from "~/api/doris";

/** The two arrangements the extension puts rows in, over the CLI's answer. */
export type SortBy = "seeds" | "size";

/**
 * A stable re-arrangement of the CLI's answer: the same rows, in order.
 * A fresh batch is sorted with the batches already shown, so a row that
 * arrives late with the most seeds lands at the top rather than behind
 * whatever the first wave brought.
 */
export function sortRows(rows: TrackedRow[], sort: SortBy): TrackedRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "size") {
      return b.size_bytes - a.size_bytes || b.seeds_n - a.seeds_n;
    }
    return b.seeds_n - a.seeds_n || b.size_bytes - a.size_bytes;
  });
}

/**
 * The rows of the wanted sources. `null` means no filter: everything stays.
 */
export function filterBySources(
  rows: TrackedRow[],
  sources: ReadonlySet<string> | null,
): TrackedRow[] {
  return sources === null ? rows : rows.filter((row) => sources.has(row.source));
}
