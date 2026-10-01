import assert from "node:assert/strict";

import { parseStored } from "../src/utils.ts";

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

const fallback = { langFrom: "auto", langTo: ["en"] };

check("a stored value comes back", () => {
  assert.deepEqual(parseStored('{"langFrom":"ru","langTo":["de"]}', fallback), {
    langFrom: "ru",
    langTo: ["de"],
  });
});

check("nothing stored means the default, whatever nothing looks like", () => {
  // Measured: on a fresh install `LocalStorage.getItem` resolves with `null`, not
  // `undefined`, even though its type says `undefined`. Guarding only for
  // `undefined` let `JSON.parse(null)` through, which is `null`, which every
  // command then read `.langFrom` off.
  assert.deepEqual(parseStored(null, fallback), fallback);
  assert.deepEqual(parseStored(undefined, fallback), fallback);
});

check("a stored null is not a value", () => {
  assert.deepEqual(parseStored("null", fallback), fallback);
});

check("a value from an older version is not a crash", () => {
  assert.deepEqual(parseStored("", fallback), fallback);
  assert.deepEqual(parseStored("{not json", fallback), fallback);
  assert.deepEqual(parseStored("undefined", fallback), fallback);
});

check("a stored false or zero is a value, not nothing", () => {
  assert.equal(parseStored("false", true), false);
  assert.equal(parseStored("0", 1), 0);
  assert.equal(parseStored('""', "default"), "");
});

console.log(`\nall ${checks} checks passed`);