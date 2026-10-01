import assert from "node:assert/strict";

import {
  CATEGORIES,
  DEFAULT_FILTERS,
  isCategoryOn,
  toggleCategory,
  withFilter,
  type CategoryBit,
  type Filters,
} from "../src/filters.ts";

/**
 * The categories are three independent checkboxes, not one choice out of seven.
 *
 * On wallhaven.cc each category is its own checkbox and they compose: unchecking Anime while
 * General stays on narrows the results to General. Measured today:
 *
 *   categories=110 → total 73364,  page has general and anime
 *   categories=100 → total 67086,  page has general only
 *   categories=000 → total 104629, identical to 111 — an empty mask is ignored, not "nothing"
 *
 * That last line is why `toggleCategory` refuses to switch off the final category.
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

const bits = CATEGORIES.map((c) => c.bit);
const filtersWith = (categories: string): Filters => ({
  ...DEFAULT_FILTERS,
  categories: categories as Filters["categories"],
});

check("there are exactly three categories, one per bit", () => {
  assert.equal(bits.length, 3);
  assert.deepEqual([...bits].sort(), ["001", "010", "100"], "general, anime, people");
});

check("turning one category off leaves the others alone", () => {
  // The whole complaint: unchecking Anime must not also uncheck General.
  const filters = withFilter(DEFAULT_FILTERS, "categories", "110");
  const after = toggleCategory(filters, "010");
  assert.equal(after.categories, "100");
  assert.equal(isCategoryOn(after, "100"), true, "general must survive");
  assert.equal(isCategoryOn(after, "010"), false, "anime must be off");
  assert.equal(isCategoryOn(after, "001"), false, "people was never on");
});

check("turning one category on leaves the others alone", () => {
  const filters = withFilter(DEFAULT_FILTERS, "categories", "100");
  assert.equal(toggleCategory(filters, "010").categories, "110");
  assert.equal(toggleCategory(filters, "001").categories, "101");
  // Order must not matter: people then anime from a bare General.
  const people = toggleCategory(filters, "001");
  assert.equal(toggleCategory(people, "010").categories, "111");
});

check("toggling is reversible", () => {
  for (const bit of bits) {
    const on = filtersWith("111");
    const off = toggleCategory(on, bit);
    assert.equal(off.categories === "111", false, `${bit} should switch off`);
    assert.equal(toggleCategory(off, bit).categories, "111", `${bit} should switch back on`);
  }
});

check("the last standing category cannot be switched off", () => {
  // categories=000 is answered by wallhaven as "no category filter" — 104629 results,
  // everything. Unchecking the last box must not mean "show me nothing but nothing".
  for (const bit of bits) {
    const only = filtersWith(bit);
    assert.equal(toggleCategory(only, bit), only, `${bit}: no change when it is the only one`);
    assert.equal(toggleCategory(only, bit).categories, bit);
  }
});

check("every reachable mask is a valid three-bit string", () => {
  let filters = DEFAULT_FILTERS;
  const seen = new Set<string>([filters.categories]);
  // Walk every toggle from every state; none may produce something malformed.
  for (const bit of bits) {
    const off = toggleCategory(filters, bit);
    if (off.categories !== filters.categories) {
      assert.match(off.categories, /^[01]{3}$/, off.categories);
      seen.add(off.categories);
    }
    filters = toggleCategory(off, bit);
  }
  assert.ok(seen.size > 1, "toggling must actually change the mask");
});

check("an unknown bit is ignored rather than corrupting the mask", () => {
  const filters = filtersWith("101");
  assert.equal(toggleCategory(filters, "000" as CategoryBit), filters);
});

check("the original object is never mutated", () => {
  const before = filtersWith("110");
  toggleCategory(before, "010");
  assert.equal(before.categories, "110");
});

check("toggling a category keeps the sort mode", () => {
  const filters = withFilter(withFilter(DEFAULT_FILTERS, "sorting", "relevance"), "categories", "111");
  assert.equal(toggleCategory(filters, "010").sorting, "relevance");
  const sorted = withFilter(DEFAULT_FILTERS, "sorting", "views");
  assert.equal(toggleCategory(sorted, "001").sorting, "views");
});

check("isCategoryOn agrees with the mask", () => {
  const filters = filtersWith("101");
  assert.equal(isCategoryOn(filters, "100"), true);
  assert.equal(isCategoryOn(filters, "010"), false);
  assert.equal(isCategoryOn(filters, "001"), true);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);