import assert from "node:assert/strict";

import { applySelection, DEFAULT_FILTERS, type Filters } from "../src/filters.ts";

/**
 * One dropdown, four sections. The dropdown reports the selected item's value and never says
 * which section it came from, so the prefix on the value is the only thing distinguishing
 * "toggle the general category" from "replace the sort mode".
 *
 * Getting this wrong is invisible in the type checker and in the UI: a `cat:100` handled by the
 * sorting branch would silently swap the sort mode instead of narrowing the categories, and the
 * list would change without the checkmark moving.
 */

let passed = 0;
let failed = 0;
function check(name: string, body: () => void) {
  try {
    body();
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

const base = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

check("cat: toggles the category and nothing else", () => {
  const filters = base({ sorting: "relevance", topRange: "1y" });
  const after = applySelection(filters, "cat:010");
  assert.equal(after.categories, "101", "anime should switch off");
  assert.equal(after.sorting, "relevance", "sorting must be untouched");
  assert.equal(after.topRange, "1y", "top range must be untouched");
});

check("sort: replaces the sort mode and nothing else", () => {
  const filters = base({ categories: "100" });
  const after = applySelection(filters, "sort:views");
  assert.equal(after.sorting, "views");
  assert.equal(after.categories, "100", "categories must be untouched");
});

check("pur: replaces purity and nothing else", () => {
  const filters = base({ categories: "011", sorting: "favorites" });
  const after = applySelection(filters, "pur:110");
  assert.equal(after.purity, "110");
  assert.equal(after.categories, "011");
  assert.equal(after.sorting, "favorites");
});

check("range: replaces the top range and nothing else", () => {
  const filters = base({ sorting: "toplist", topRange: "1M", categories: "110" });
  const after = applySelection(filters, "range:1y");
  assert.equal(after.topRange, "1y");
  assert.equal(after.sorting, "toplist");
  assert.equal(after.categories, "110");
});

check("every prefix lands on its own field, for every value it accepts", () => {
  const kinds = ["cat", "pur", "sort", "range"] as const;
  const values: Record<(typeof kinds)[number], string[]> = {
    cat: ["100", "010", "001"],
    pur: ["100", "110", "111"],
    sort: ["relevance", "views", "favorites", "toplist"],
    range: ["1d", "1M", "1y"],
  };
  // Start from something distinctive per field so a cross-wired assignment is visible.
  const seeds: Record<(typeof kinds)[number], Partial<Filters>> = {
    cat: { categories: "011" },
    pur: { purity: "111" },
    sort: { sorting: "date_added" },
    range: { topRange: "3M" },
  };

  for (const kind of kinds) {
    for (const value of values[kind]) {
      const after = applySelection(base(seeds[kind]), `${kind}:${value}`);
      const expected = { ...base(seeds[kind]) };
      // The single field this prefix owns must be the one that moved.
      const field = { cat: "categories", pur: "purity", sort: "sorting", range: "topRange" }[kind];
      const before = base(seeds[kind]);
      for (const key of Object.keys(expected) as (keyof Filters)[]) {
        if (key === field) continue;
        assert.equal(after[key], before[key], `${kind}:${value} also changed ${key}`);
      }
    }
  }
});

check("an unprefixed or unknown value changes nothing", () => {
  const filters = base({ categories: "100", sorting: "views" });
  // Better a no-op than blanking the search over a value the runtime invented.
  assert.equal(applySelection(filters, "views"), filters);
  assert.equal(applySelection(filters, "nonsense:1"), filters);
  assert.equal(applySelection(filters, ""), filters);
  assert.equal(applySelection(filters, ":100"), filters);
});

check("the empty prefix is not mistaken for a category", () => {
  // ":100" must not toggle general: the prefix decides, not the value.
  const filters = base({ categories: "111" });
  assert.equal(applySelection(filters, ":100").categories, "111");
});

check("selecting the same category twice is a round trip", () => {
  const filters = base({ categories: "111" });
  const off = applySelection(filters, "cat:010");
  assert.equal(off.categories, "101");
  assert.equal(applySelection(off, "cat:010").categories, "111");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);