import assert from "node:assert/strict";

import { absoluteDate, compactCount, relativeTime } from "../src/utils/format.ts";
import {
  clonePathFor,
  editorBinary,
  expandHome,
  httpsCloneUrl,
  isSupportedEditor,
} from "../src/utils/launch.ts";

/**
 * Self-check for the display, path and editor-mapping helpers.
 *
 * This file imports `src/utils/launch.ts` directly, which only works because
 * that module is free of `@vicinae/api`. The Vicinae runtime's `getGlobal()`
 * returns undefined outside Vicinae, so importing the API here throws. Keeping
 * `utils/` pure is what makes it checkable; the impure half lives in
 * `src/api/open-repository.ts`.
 *
 * Relative time is asserted on unit selection rather than exact wording,
 * because `Intl.RelativeTimeFormat` with `numeric: "auto"` renders -1 day as
 * "yesterday" and -1 week as "last week" depending on ICU data. What matters is
 * that three days reads as days and not as 72 hours.
 */

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

const NOW = new Date("2026-03-15T12:00:00.000Z");

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// --- relative time ----------------------------------------------------------

check("anything under a minute reads as just now", () => {
  assert.equal(relativeTime(at(0), NOW), "just now");
  assert.equal(relativeTime(at(59 * SECOND), NOW), "just now");
  assert.equal(relativeTime(at(-59 * SECOND), NOW), "just now");
});

check("the largest fitting unit is chosen", () => {
  assert.match(relativeTime(at(3 * HOUR), NOW), /hour/i);
  assert.match(relativeTime(at(3 * DAY), NOW), /day/i);
  assert.match(relativeTime(at(3 * 7 * DAY), NOW), /week/i);
  assert.match(relativeTime(at(70 * DAY), NOW), /month/i);
  assert.match(relativeTime(at(400 * DAY), NOW), /year/i);
});

check("a minute is never rendered as an hour", () => {
  assert.match(relativeTime(at(90 * MINUTE), NOW), /hour/);
});

check("future timestamps are phrased as future", () => {
  assert.match(relativeTime(at(2 * HOUR), NOW), /^in /);
  assert.match(relativeTime(at(3 * DAY), NOW), /^in /);
});

check("an unparseable date yields an empty string, not NaN", () => {
  assert.equal(relativeTime("not-a-date", NOW), "");
  assert.equal(relativeTime("", NOW), "");
});

// --- absolute dates and counts ----------------------------------------------

check("absolute dates render as day month year", () => {
  // Field order follows ICU ("Mar 12, 2024" in en-US), so assert the parts.
  const rendered = absoluteDate("2024-03-12T00:00:00Z");
  for (const part of ["Mar", "12", "2024"]) {
    assert.ok(rendered.includes(part), `missing "${part}" in "${rendered}"`);
  }
});

check("an unparseable absolute date yields an empty string", () => {
  assert.equal(absoluteDate("nope"), "");
});

check("counts stay readable at scale", () => {
  assert.equal(compactCount(0), "0");
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(1000), "1k");
  assert.equal(compactCount(1200), "1.2k");
  assert.equal(compactCount(12_300), "12k");
  assert.equal(compactCount(1_000_000), "1M");
  assert.equal(compactCount(3_400_000), "3.4M");
});

check("a non-finite count yields an empty string", () => {
  assert.equal(compactCount(Number.NaN), "");
});

// --- paths ------------------------------------------------------------------

check("a leading tilde expands to the home directory", () => {
  assert.equal(expandHome("~", "/home/black"), "/home/black");
  assert.equal(expandHome("~/Code", "/home/black"), "/home/black/Code");
  assert.equal(expandHome("  ~/Code  ", "/home/black"), "/home/black/Code");
});

check("an absolute or relative path is left alone", () => {
  assert.equal(expandHome("/srv/repos", "/home/black"), "/srv/repos");
  assert.equal(expandHome("repos", "/home/black"), "repos");
  assert.equal(expandHome("~notauser/x", "/home/black"), "~notauser/x", "only a bare ~ or ~/ expands");
});

check("clone paths nest under the owner", () => {
  assert.equal(clonePathFor("~/Code", "acme/widget", "/home/black"), "/home/black/Code/acme/widget");
  assert.equal(clonePathFor("/srv", "acme/widget", "/home/black"), "/srv/acme/widget");
});

check("an empty clone root does not produce a leading separator", () => {
  assert.equal(clonePathFor("", "acme/widget", "/home/black"), "acme/widget");
});

// --- editor mapping ---------------------------------------------------------

check("only configured editors are considered supported", () => {
  assert.equal(isSupportedEditor("code"), true);
  assert.equal(isSupportedEditor("none"), false);
  assert.equal(isSupportedEditor(undefined), false);
  assert.equal(isSupportedEditor("emacs"), false, "an unmapped editor must not resolve");
});

check("every supported editor maps to a launchable binary", () => {
  for (const editor of ["code", "cursor", "codium", "windsurf", "zed", "idea"]) {
    const binary = editorBinary(editor);
    assert.equal(typeof binary, "string", `${editor} has no binary`);
    assert.equal(binary, editor, `${editor} should launch by its own name`);
  }
  assert.equal(editorBinary("none"), undefined);
});

check("clone URLs are https and never doubled up", () => {
  assert.equal(httpsCloneUrl("https://github.com/acme/widget"), "https://github.com/acme/widget.git");
  assert.equal(httpsCloneUrl("https://github.com/acme/widget.git"), "https://github.com/acme/widget.git");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
