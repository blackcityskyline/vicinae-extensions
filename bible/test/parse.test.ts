import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parsePassages, osisToReference, referenceToChapterAndVerse } from "../src/parse.ts";

/**
 * Parsed against the real page, not against HTML written for the test.
 *
 * `test/fixture-john-3-16.html` is the bytes biblegateway.com actually returned for
 *
 *   https://www.biblegateway.com/passage/?search=John+3:16&version=NRSVUE&interface=print
 *
 * and `fixture-john-3-16-ru.html` is the same for `version=RUSV`. Both fetched today.
 *
 * The reason for a fixture rather than a hand-written sample: **two of the four
 * selectors upstream parses with are dead on that page**, and a hand-written sample
 * would have carried them. Measured on the fixture:
 *
 *   .passage-table    1   still there
 *   p .text          10   still there — but 10 is wrong: they are all `<span class="text">`
 *                           in the navigation menu, not verses
 *   sup.versenum      2   still there
 *   .bcv              1   only inside a <style> block, not as an element
 *   span.chapternum   0   gone entirely
 *
 * What replaced them:
 *
 *   <div class="passage-table" data-osis="John.3.16">
 *   <p><span id="en-NRSVUE-26127" class="text John-3-16">
 *        <sup class="versenum opening">16 </sup>For God so loved…
 *
 * So the reference now lives in `data-osis`, and the book/chapter/verse in the span's
 * class. Both are checked below against the bytes.
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

const read = (file: string) => readFileSync(join(__dirname, file), "utf-8");

const EN = read("fixture-john-3-16.html");
const RU = read("fixture-john-3-16-ru.html");

check("the fixture really has lost the selectors upstream used", () => {
  // If biblegateway ever restores them this fails, which is the point: the parser below
  // would then be carrying a workaround for nothing, and the message says so.
  assert.equal(/class="bcv"/.test(EN), false, ".bcv is back — the data-osis path can go");
  assert.equal(/chapternum/.test(EN), false, "chapternum is back — the class path can go");
});

check("the reference comes out of data-osis", () => {
  assert.match(EN, /data-osis="John\.3\.16"/, "the fixture no longer carries data-osis");

  const passages = parsePassages(EN);
  assert.equal(passages.length, 1);
  assert.equal(passages[0].reference, "John 3:16");
});

check("an osis reference is turned into something readable", () => {
  // The book part is whatever biblegateway abbreviates it to — measured, not guessed:
  //
  //   1 Samuel 2:3        data-osis="1Sam.2.3"      class="text 1Sam-2-3"
  //   Psalms 23:1         data-osis="Ps.23.1"        class="text Ps-23-1"
  //   2 Corinthians 5:7   data-osis="2Cor.5.7"       class="text 2Cor-5-7"
  //
  // My first version of this check expected "1 Samuel 1:1" from "1Samuel.1.1". Both the
  // separator and the spelling were invented, and neither is what the site sends.
  assert.equal(osisToReference("John.3.16"), "John 3:16");
  assert.equal(osisToReference("1Sam.2.3"), "1Sam 2:3");
  assert.equal(osisToReference("2Cor.5.7"), "2Cor 5:7");
});

check("the verse text survives", () => {
  const [passage] = parsePassages(EN);
  assert.equal(passage.verses.length, 1);

  const verse = passage.verses[0];
  assert.match(verse.text, /For God so loved the world/);
  // The verse number is markup and must not end up in the text.
  assert.doesNotMatch(verse.text, /^\s*16/, verse.text);
});

check("chapter and verse come out of the span's class, not out of nowhere", () => {
  // Upstream read span.chapternum for the chapter and sups for the verse. The chapter
  // number is gone, so it is decoded from `text John-3-16` instead.
  const [passage] = parsePassages(EN);
  assert.equal(passage.verses[0].chapter, 3);
  assert.equal(passage.verses[0].verse, 16);

  // deepEqual, not equal: assert.equal compares objects by reference and would have
  // failed on two structurally identical results.
  assert.deepEqual(referenceToChapterAndVerse("John-3-16"), { chapter: 3, verse: 16 });
  assert.deepEqual(referenceToChapterAndVerse("1Sam-2-3"), { chapter: 2, verse: 3 });
});

check("a book whose name has a digit in it is split from the right end", () => {
  // `1Sam-1-1` has to give chapter 1, not chapter 1 read as the book. So the split is on
  // the last two hyphens rather than the first.
  assert.deepEqual(referenceToChapterAndVerse("1Sam-1-1"), { chapter: 1, verse: 1 });
  assert.deepEqual(referenceToChapterAndVerse("1-Samuel-1-1"), { chapter: 1, verse: 1 });
});

check("the Russian Synodal parses the same way as the English one", () => {
  const passages = parsePassages(RU);
  assert.equal(passages.length, 1);
  assert.equal(passages[0].reference, "John 3:16");
  assert.match(passages[0].verses[0].text, /Ибо так возлюбил Бог/);
  assert.equal(passages[0].verses[0].chapter, 3);
  assert.equal(passages[0].verses[0].verse, 16);
});

check("a page with no passage yields nothing rather than an empty row", () => {
  assert.deepEqual(parsePassages("<html><body>nothing here</body></html>"), []);
});

check("a passage with no usable reference is dropped, not shown blank", () => {
  // The version and copyright are still on a page whose verses failed to parse, so the
  // list would otherwise show a row with an empty title.
  const broken = EN.replace(/data-osis="[^"]*"/, "");
  assert.deepEqual(parsePassages(broken), []);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
