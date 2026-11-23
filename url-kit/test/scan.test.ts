import assert from "node:assert/strict";

import { codesOf, imageSource } from "../src/utils/scan.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
  }
}

check("zbar's raw output is one code per line", () => {
  assert.deepEqual(codesOf("https://example.com/a\nhttps://example.com/b\n"), [
    "https://example.com/a",
    "https://example.com/b",
  ]);
});

check("the same code read twice is one code, and blank lines are noise", () => {
  assert.deepEqual(codesOf("https://example.com\n\n  https://example.com  \n"), ["https://example.com"]);
});

check("an image with no code has no lines", () => {
  assert.deepEqual(codesOf(""), []);
});

check("the argument names the image and beats the clipboard", () => {
  const source = imageSource("/tmp/arg.png", { file: "/tmp/copied.png" }, () => true);
  assert.equal(source, "/tmp/arg.png");
});

check("the clipboard's file is the image when no argument was given", () => {
  assert.equal(imageSource(undefined, { file: "/tmp/copied.png" }, () => true), "/tmp/copied.png");
});

check("a copied path counts only when it names a file that exists", () => {
  const exists = (path: string) => path === "/tmp/really.png";
  assert.equal(imageSource(undefined, { text: "/tmp/really.png" }, exists), "/tmp/really.png");
  assert.equal(imageSource(undefined, { text: "/tmp/gone.png" }, exists), undefined);
});

check("copied prose is not an image path", () => {
  // The rule is "a file that exists", so this stub answers like the disk: paths do.
  const exists = (path: string) => path.startsWith("/");
  assert.equal(imageSource(undefined, { text: "hello there" }, exists), undefined);
  assert.equal(imageSource(undefined, { text: "/tmp/a.png\n/tmp/b.png" }, exists), undefined);
});

check("an empty clipboard has no image", () => {
  assert.equal(imageSource(undefined, {}, () => true), undefined);
});

if (failed > 0) process.exitCode = 1;
console.log(failed ? `${failed} failed` : `all ${passed} checks passed`);
