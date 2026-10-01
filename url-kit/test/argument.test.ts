import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { textToShorten } from "../src/utils/url.ts";

// tsx runs this as CommonJS, where `import.meta` is not available.
const fromHere = (...parts: string[]) => join(__dirname, ...parts);

/**
 * The argument form of Shorten URL, and where a shortened link goes.
 *
 * Upstream `url-shortener` had two commands this did not: one taking the link from the
 * command argument, and a `clipboard` preference choosing between copying the result and
 * pasting it into the focused window. Both are here, with the paste order checked —
 * see the last check, which exists because getting it wrong is invisible until a human
 * tries it.
 */

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
  assert.equal(textToShorten("https://example.com/a", "https://other.example/b"), "https://example.com/a");
});

check("an empty or absent argument falls back to the clipboard", () => {
  assert.equal(textToShorten("", "https://other.example/b"), "https://other.example/b");
  assert.equal(textToShorten("   ", "https://other.example/b"), "https://other.example/b");
  assert.equal(textToShorten(undefined, "https://other.example/b"), "https://other.example/b");
});

check("both sides are trimmed, because a deeplink carries what it is given", () => {
  // `?url= https://… ` is what a shell hands over; the field should hold it without the
  // spaces, or the shortener gets a link it cannot shorten.
  assert.equal(textToShorten("  https://example.com/a  ", ""), "https://example.com/a");
});

check("with nothing anywhere the field starts empty rather than undefined", () => {
  assert.equal(textToShorten("", ""), "");
  assert.equal(textToShorten(undefined, undefined), "");
});

check("the argument is not second-guessed before it reaches the shortener", () => {
  // Validation belongs to one place. If this filtered here, a link the shortener would
  // have accepted would be rejected by the form instead, with a different message.
  const odd = "HTTP://Example.COM/a";
  assert.equal(textToShorten(odd, ""), odd);
});

// The order that matters, and that only shows up when a human presses the key.
check("paste closes the window before it pastes", () => {
  const form = readFileSync(fromHere("..", "src", "components", "clipboard-form.tsx"), "utf-8");

  const close = form.indexOf("closeMainWindow(");
  const paste = form.indexOf("Clipboard.paste(");

  assert.ok(close > 0, "closeMainWindow is not called at all");
  assert.ok(paste > 0, "Clipboard.paste is not called at all");
  assert.ok(close < paste, "it pastes while the form still holds focus, so the link lands in the form");

  // Vicinae's own Action.Paste does the same and says why.
  assert.match(form, /close before pasting|before it pastes/i);
});

check("both output modes exist, and copy is the default", () => {
  const pkg = JSON.parse(
    readFileSync(fromHere("..", "package.json"), "utf-8"),
  ) as {
    preferences: { name: string; default: string; data: { value: string }[] }[];
  };

  const output = pkg.preferences.find((pref) => pref.name === "output");
  assert.ok(output, "the output preference is missing");
  assert.equal(output.default, "copy");
  assert.deepEqual(
    output.data.map((entry) => entry.value).sort(),
    ["copy", "paste"],
  );
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
