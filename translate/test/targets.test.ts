import assert from "node:assert/strict";

import { uniqueTargets } from "../src/utils.ts";

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

check("two identical targets become one", () => {
  // What the preferences default to: lang1 and lang2 are both "en". Translating
  // into English twice returned the input back twice, which reads as a broken
  // command rather than as a missing target.
  assert.deepEqual(uniqueTargets(["en", "en"]), ["en"]);
});

check("the order the user set is kept", () => {
  assert.deepEqual(uniqueTargets(["ru", "it"]), ["ru", "it"]);
  assert.deepEqual(uniqueTargets(["it", "ru"]), ["it", "ru"]);
});

check("only the first of a repeated language survives", () => {
  assert.deepEqual(uniqueTargets(["ru", "en", "ru", "it", "en"]), ["ru", "en", "it"]);
});

check("auto-detect is not a target", () => {
  assert.deepEqual(uniqueTargets(["auto", "ru"], "auto"), ["ru"]);
  assert.deepEqual(uniqueTargets(["ru", "auto"], "auto"), ["ru"]);
  // It is filtered against the source, so a deliberate ru -> auto is left alone.
  assert.deepEqual(uniqueTargets(["ru", "auto"], "en"), ["ru", "auto"]);
});

check("nothing left means nothing, and the caller decides what to do", () => {
  assert.deepEqual(uniqueTargets([]), []);
  assert.deepEqual(uniqueTargets(["auto"], "auto"), []);
  assert.deepEqual(uniqueTargets(["", "en"]), ["en"]);
});

console.log(`\nall ${checks} checks passed`);
