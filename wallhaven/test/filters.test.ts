import assert from "node:assert/strict";

import {
  CATEGORIES,
  DEFAULT_FILTERS,
  describeFilters,
  PURITIES,
  SORTINGS,
  TOP_RANGES,
  withFilter,
  toSearchParams,
} from "../src/filters.ts";

/**
 * The complaint these checks answer: "I can only set a filter or a sort mode, not both."
 *
 * It was never the API. wallhaven takes every filter and the sort mode in one request —
 * `?q=nature&categories=100&purity=100&sorting=relevance` answers 67086 results today, the
 * same count as `sorting=date_added` with a different order, so both apply. The restriction
 * was one dropdown with one `storeValue`: it could only show the last thing picked, so every
 * other choice looked discarded.
 *
 * The fix is two independent controls over one state object. These checks pin the part that
 * can silently regress: that changing one field leaves the others exactly as they were.
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

const params = (filters: typeof DEFAULT_FILTERS, over: Partial<Parameters<typeof toSearchParams>[1]> = {}) =>
  toSearchParams(filters, { query: "nature", sfwOnly: false, page: 1, ...over });

check("setting a category keeps the sort mode", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "sorting", "relevance"), "categories", "100");
  const request = params(filters);
  assert.equal(request.categories, "100");
  assert.equal(request.sorting, "relevance");
});

check("setting a sort mode keeps the category", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "categories", "100"), "sorting", "relevance");
  const request = params(filters);
  assert.equal(request.categories, "100");
  assert.equal(request.sorting, "relevance");
});

check("every filter survives every sort mode, in both orders", () => {
  for (const category of CATEGORIES) {
    for (const sorting of SORTINGS) {
      const filters = withFilter(withFilter(DEFAULT_FILTERS, "categories", category.value), "sorting", sorting.value);
      const request = params(filters);
      assert.equal(request.categories, category.value, `${category.title} lost`);
      assert.equal(request.sorting, sorting.value, `${sorting.title} lost`);
    }
  }
});

check("withFilter touches one field and returns a new object", () => {
  const before = { ...DEFAULT_FILTERS };
  const after = withFilter(before, "sorting", "views");
  assert.equal(before.sorting, "date_added", "the original must not be mutated");
  assert.equal(after.sorting, "views");
  assert.equal(after.categories, before.categories);
});

check("safe search overrides purity without discarding the rest", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "purity", "111"), "sorting", "views");
  const request = toSearchParams(filters, { query: "", sfwOnly: true, page: 1 });
  // sfwOnly is a promise that NSFW never shows; a purity choice that could override it
  // would not be one. The sort mode must still survive the override.
  assert.equal(request.purity, "100");
  assert.equal(request.sorting, "views");
  assert.equal(request.categories, filters.categories);
});

check("topRange rides along only for toplist", () => {
  const toplist = withFilter(withFilter(DEFAULT_FILTERS, "sorting", "toplist"), "topRange", "1y");
  assert.equal(params(toplist).topRange, "1y");

  const relevance = withFilter(toplist, "sorting", "relevance");
  assert.equal(params(relevance).topRange, undefined, "a stale range must not be sent");
});

check("the range dropdown is a real choice for every sorting that needs it", () => {
  for (const range of TOP_RANGES) {
    const filters = withFilter(withFilter(DEFAULT_FILTERS, "sorting", "toplist"), "topRange", range.value);
    assert.equal(params(filters).topRange, range.value);
  }
});

check("random carries the seed, other sort modes drop it", () => {
  const random = withFilter(DEFAULT_FILTERS, "sorting", "random");
  assert.equal(params(random, { seed: "seed-1" }).seed, "seed-1");
  assert.equal(params(withFilter(random, "sorting", "views"), { seed: "seed-1" }).seed, undefined);
});

check("a blank search box sends no term at all", () => {
  // `?q=` and no `q` are different requests. Measured: `?q=&sorting=relevance` answers
  // 337562, omitting `q` answers a different set.
  assert.equal(params(DEFAULT_FILTERS, { query: "" }).q, undefined);
});

check("the summary names the category and the sort mode together", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "categories", "100"), "sorting", "relevance");
  const summary = describeFilters(filters);
  assert.match(summary, /General/);
  assert.match(summary, /relevance/i);
});

check("the summary omits an unfiltered category", () => {
  // "All · date added" is noise; the point of the label is to show what is narrowing.
  assert.doesNotMatch(describeFilters(DEFAULT_FILTERS), /All/);
});

check("the summary carries the range when toplist is chosen", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "sorting", "toplist"), "topRange", "3M");
  assert.match(describeFilters(filters), /last 3 months/i);
});

check("every dropdown value is unique, or storeValue would cross wires", () => {
  const lists = [CATEGORIES, PURITIES, SORTINGS, TOP_RANGES];
  for (const list of lists) {
    const values = list.map((item) => item.value);
    assert.equal(new Set(values).size, values.length, `duplicate value in ${list.map((i) => i.title).join(", ")}`);
  }
});

check("every category and purity value is the bitmask wallhaven expects", () => {
  for (const item of CATEGORIES) assert.match(item.value, /^[01]{3}$/, item.title);
  for (const item of PURITIES) assert.match(item.value, /^[01]{3}$/, item.title);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);