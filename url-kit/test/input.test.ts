import assert from "node:assert/strict";

import { initialText } from "../src/utils/input.ts";

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

check("the argument wins over the clipboard", () => {
  assert.equal(initialText("https://example.com/a", "https://other.example/b"), "https://example.com/a");
});

check("an empty or absent argument falls back to the clipboard", () => {
  assert.equal(initialText("", "https://other.example/b"), "https://other.example/b");
  assert.equal(initialText("   ", "https://other.example/b"), "https://other.example/b");
  assert.equal(initialText(undefined, "https://other.example/b"), "https://other.example/b");
});

check("both sides are trimmed, because a deeplink carries what it is given", () => {
  assert.equal(initialText("  https://example.com/a  ", ""), "https://example.com/a");
  assert.equal(initialText(undefined, "\n https://example.com/b \n"), "https://example.com/b");
});

check("with nothing anywhere the field starts empty, and null from the runtime is not a crash", () => {
  assert.equal(initialText("", ""), "");
  assert.equal(initialText(undefined, undefined), "");
  assert.equal(initialText(null as unknown as undefined, null as unknown as undefined), "");
});

check("the value is not second-guessed before the command uses it", () => {
  // Validation belongs to one place. If this filtered here, a link the shortener would
  // have accepted would be rejected by the form instead, with a different message.
  const odd = "HTTP://Example.COM/a";
  assert.equal(initialText(odd, ""), odd);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
