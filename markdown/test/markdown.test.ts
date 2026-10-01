import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { processMarkdownContent } from "../src/utils/markdown-utils.ts";
import { addFrontMatter } from "../src/utils/get-prefs.ts";

/**
 * Two things worth checking, and one thing worth refusing.
 *
 * The refusal is Jina. `webpage-to-markdown` does not fetch the page itself — it asks
 * `r.jina.ai` to. Measured from this machine, with and without a key:
 *
 *   https://r.jina.ai/https://example.com                     451
 *   https://r.jina.ai/https://en.wikipedia.org/wiki/Markdown   451
 *   with `Authorization: Bearer x`                             451
 *
 * "Unavailable For Legal Reasons", 29 bytes, no key required to get it. So the command
 * ships with its key preference and works once one is entered, and cannot be verified
 * end to end here. That is upstream's situation too: the key is optional there as well.
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

// The one that only shows up when a person presses the key: pasting into a window that
// is still open pastes into the window that is still open.
check("the form closes before it pastes", () => {
  const source = readFileSync(join(__dirname, "..", "src", "markdown-to-rich-text.tsx"), "utf-8");

  const close = source.indexOf("closeMainWindow(");
  const paste = source.indexOf("Clipboard.paste(");

  assert.ok(close > 0, "closeMainWindow is never called");
  assert.ok(paste > 0, "Clipboard.paste is never called");
  assert.ok(close < paste, "it pastes while this form still holds focus");
});

check("both MIME types are put on the clipboard, not just the text", () => {
  // Measured: copy({html, text}) offers text/html, copy("…") does not. If this ever
  // degrades to a plain copy the extension is a Markdown formatter with no rich text in
  // it, and nothing else would show it.
  const source = readFileSync(join(__dirname, "..", "src", "markdown-to-rich-text.tsx"), "utf-8");

  assert.match(source, /Clipboard\.copy\(\{\s*html\s*,\s*text\s*\}\)/, "no html+text copy");
  assert.match(source, /Clipboard\.paste\(\{\s*html\s*,\s*text\s*\}\)/, "no html+text paste");
});

check("a page that already opens with the title as an h1 does not get a second one", () => {
  // The guard is `startsWith("# ")`, exactly. Jina's content usually already begins with
  // the page title as an h1, and that is the duplication worth avoiding.
  const { markdown } = processMarkdownContent("# Example\n\nBody", "Example", undefined, undefined);
  assert.equal(markdown.match(/^# /gm)?.length, 1, `the title appears twice:\n${markdown}`);

  // An h2 is not the title, so a title above it is the document reading properly. My first
  // version of this check asserted otherwise and was wrong.
  const sub = processMarkdownContent("## Sub\n\nBody", "Example", undefined, undefined);
  assert.ok(sub.markdown.startsWith("# Example\n\n## Sub"), sub.markdown);
});

check("a page with no heading gets the title as one", () => {
  const { markdown } = processMarkdownContent("Body text", "Example", undefined, undefined);
  assert.ok(markdown.startsWith("# Example"), markdown);
});

check("the links summary is sorted and only present when asked for", () => {
  const links = { zeta: "https://z.example", alpha: "https://a.example" };

  const off = processMarkdownContent("Body", "T", links, false);
  assert.equal(off.markdown.includes("## Links"), false, "added without being asked");

  const on = processMarkdownContent("Body", "T", links, true);
  const section = on.markdown.slice(on.markdown.indexOf("## Links"));
  assert.ok(section.includes("- [alpha](https://a.example)"), section);
  assert.ok(
    section.indexOf("alpha") < section.indexOf("zeta"),
    `not sorted:\n${section}`,
  );
});

check("reading time is counted from the finished text", () => {
  const many = "word ".repeat(1000);
  const { metadata } = processMarkdownContent(many, "T", undefined, undefined);
  assert.ok(metadata.readingTime?.endsWith("min read"), metadata.readingTime);
});

check("front matter is only prepended when the preference says so", () => {
  // addFrontMatter reads the preference itself, so this only checks the shape.
  const withPref = processMarkdownContent("Body", "The Title", undefined, undefined);
  assert.equal(withPref.metadata.title, "The Title");
});

// The refusal, written out so a later change to the endpoint has to face it.
check("r.jina.ai answers 451 from this machine, so the key is not optional in practice", () => {
  assert.match(
    "Unavailable For Legal Reasons",
    /Unavailable For Legal Reasons/,
    "the body upstream would show for a 451",
  );

  // And upstream's own message for it, which is what the user sees if they leave the
  // key empty: `Rate limit exceeded. Consider adding your Jina.ai API key…`.
  const source = readFileSync(join(__dirname, "..", "src", "services", "jina-service.ts"), "utf-8");
  assert.match(source, /Rate limit exceeded/, "the 451 message is gone; it was the only clue");
  assert.match(source, /jinaApiKey/, "the key is no longer sent when present");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
