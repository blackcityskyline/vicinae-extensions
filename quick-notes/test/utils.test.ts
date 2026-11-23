import assert from "node:assert/strict";

import { countWords, getDeletedTags } from "../src/utils/utils.ts";
import type { Tag } from "../src/services/atoms.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

const tag = (name: string): Tag => ({ name, color: "red" });

check("getDeletedTags returns tags dropped from the new set", () => {
  const a = tag("a");
  const b = tag("b");
  const c = tag("c");
  assert.deepEqual(getDeletedTags([a, b, c], [a, b]), [c]);
});

check("getDeletedTags returns nothing when the new set keeps them all", () => {
  const a = tag("a");
  const b = tag("b");
  assert.deepEqual(getDeletedTags([a, b], [a, b, tag("c")]), []);
});

check("countWords counts markdown words, not markup", () => {
  assert.equal(countWords("hello world"), 2);
  assert.equal(countWords("# Title\n\nSome text here"), 4);
  assert.equal(countWords(""), 0);
});

console.log(`\n${checks} checks`);
