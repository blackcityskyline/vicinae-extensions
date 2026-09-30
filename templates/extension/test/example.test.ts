import assert from "node:assert/strict";

/**
 * Self-check for pure logic.
 *
 * Vicinae has no test runner, so this is a plain script: `npm test` runs it
 * with tsx and a non-zero exit fails. Put one of these next to any module with
 * real logic (parsing, crypto, formatting) and delete this one otherwise.
 *
 * Import with an explicit .ts extension and keep allowImportingTsExtensions on
 * in tsconfig.json.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

check("slugify lowercases and joins words", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

check("slugify collapses punctuation and trims dashes", () => {
  assert.equal(slugify("  Foo & Bar!!  "), "foo-bar");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
