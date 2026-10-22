import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { versions } from "../assets/bible-versions.json";
import {
  copyrightOf,
  createSearchUrl,
  search,
  versionOf,
} from "../src/bibleGatewayApi.ts";
import {
  createClipboardText,
  createMarkdown,
  getContentsOfLastParenthesis,
  parseReference,
  versionFromAbbrev,
} from "../src/bibleSearch.tsx";
import { DEFAULT_BIBLE_VERSION } from "../src/useBibleVersion.ts";
import { osisToReference } from "../src/parse.ts";
import {
  isRussianVersion,
  localizeReference,
  normalizeQuery,
} from "../src/books.ts";
import type { ReferenceSearchResult } from "../src/types.ts";

/**
 * The formatting half of the extension: what actually reaches the clipboard and
 * the preview, plus the two HTML readers that `search()` wraps.
 *
 * Everything here is checked against the fetched page (`fixture-john-3-16*.html`)
 * rather than against markup written for the test. The formatting functions read
 * the same shapes the parser produces, and the reference line is checked with the
 * version string the site really sends: `<strong><a …>Name</a> (NRSVUE)</strong>`.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

class Skip extends Error {}

function check(name: string, body: () => void | Promise<void>): void {
  checks.push([name, body]);
}

const checks: Array<[string, () => void | Promise<void>]> = [];

const read = (file: string) => readFileSync(join(__dirname, file), "utf-8");

const EN = read("fixture-john-3-16.html");
const RU = read("fixture-john-3-16-ru.html");

const RESULT: ReferenceSearchResult = {
  version: "New Living Translation (NLT)",
  copyright: "Copyright © 1996, 2004, 2015 by Tyndale House Foundation.",
  passages: [
    {
      reference: "John 3:16",
      verses: [
        { chapter: 3, verse: 16, text: "For God so loved the world" },
        { chapter: 3, verse: 17, text: "God did not send his Son" },
      ],
    },
  ],
};

check("the shipped version list is intact", () => {
  assert.equal(versions.length, 233, "the version list lost entries");

  const ids = versions.map((v) => v.id);
  const abbrevs = versions.map((v) => v.abbrev);
  assert.equal(new Set(ids).size, ids.length, "two versions share an id");
  assert.equal(new Set(abbrevs).size, abbrevs.length, "two versions share an abbreviation");
  assert.equal(
    versions.filter((v) => !v.id || !v.name || !v.abbrev).length,
    0,
    "a version is missing a field the dropdown needs",
  );
  assert.equal(
    versions.some((v) => v.id === DEFAULT_BIBLE_VERSION),
    true,
    "the default version is not in the list",
  );
});

check("a search URL asks for the print page and encodes the query", () => {
  const url = createSearchUrl("John 3:16", "NRSVUE");
  assert.equal(url.origin + url.pathname, "https://www.biblegateway.com/passage/");
  assert.equal(url.searchParams.get("search"), "John 3:16");
  assert.equal(url.searchParams.get("version"), "NRSVUE");
  assert.equal(url.searchParams.get("interface"), "print");
  assert.match(url.search, /search=John\+3%3A16/, "the reference was not encoded");
});

check("the version comes out of the page's own markup", () => {
  // `<strong><a …>Name</a> (NRSVUE)</strong>`: the text is not a direct child.
  assert.equal(versionOf(EN), "New Revised Standard Version Updated Edition (NRSVUE)");
  assert.equal(versionOf(RU), "Russian Synodal Version (RUSV)");
  assert.equal(versionOf("<html><body>nothing</body></html>"), "");
});

check("the copyright notice keeps its text when the page links inside it", () => {
  assert.match(copyrightOf(EN), /^New Revised Standard Version, Updated Edition\./);
  assert.match(copyrightOf(EN), /© 2021/);
  // The Russian page wraps its rights statement in a link: "by <a>Public Domain</a>".
  assert.equal(copyrightOf(RU), "by Public Domain");
  assert.equal(copyrightOf("<html><body>nothing</body></html>"), "");
});

check("only the last parenthesis counts as the abbreviation", () => {
  assert.equal(getContentsOfLastParenthesis("New Living Translation (NLT)"), "NLT");
  assert.equal(
    getContentsOfLastParenthesis("New American Bible (Revised Edition) (NABRE)"),
    "NABRE",
  );
  // Nothing to take: the whole string is the version, not an empty label.
  assert.equal(getContentsOfLastParenthesis("King James Version"), "King James Version");
  assert.equal(getContentsOfLastParenthesis("Unbalanced (KJV"), "Unbalanced (KJV");
});

check("a reference keeps its version only when the version is real", () => {
  assert.deepEqual(parseReference("John 3:16 NIV"), { ref: "John 3:16", version: "NIV" });
  assert.deepEqual(parseReference("John 3:16 (niv)"), { ref: "John 3:16", version: "NIV" });
  assert.deepEqual(parseReference("John 3:16 [NIV]"), { ref: "John 3:16", version: "NIV" });
  assert.deepEqual(parseReference("  John 3:16 NRSVUE  "), {
    ref: "John 3:16",
    version: "NRSVUE",
  });
  // An abbreviation that is not in the list is part of the query, not a version.
  assert.deepEqual(parseReference("John 3:16 ZZZZ"), {
    ref: "John 3:16 ZZZZ",
    version: undefined,
  });
  assert.deepEqual(parseReference(""), { ref: "", version: undefined });
});

check("an abbreviation is matched without its brackets and in any case", () => {
  assert.equal(versionFromAbbrev("nlt", versions)?.id, "NLT");
  assert.equal(versionFromAbbrev("(NLT)", versions)?.id, "NLT");
  assert.equal(versionFromAbbrev("[nrsvue]", versions)?.id, "NRSVUE");
  assert.equal(versionFromAbbrev("ZZZZ", versions), undefined);
});

check("the preview shows verse numbers, reference and copyright when asked", () => {
  const markdown = createMarkdown(
    {
      includeVerseNumbers: true,
      includeReferences: true,
      includeCopyright: true,
      oneVersePerLine: false,
    },
    RESULT,
  );

  assert.match(markdown, /\[16\] For God so loved the world \[17\] God did not send his Son/);
  // Two spaces before the newline are what Markdown needs for a hard break.
  assert.match(markdown, /God did not send his Son {2}\nJohn 3:16 \(NLT\)/);
  assert.match(markdown, /\n\n---\n\n\*Copyright © 1996/);
});

check("one verse per line changes the separator, not the text", () => {
  const options = {
    includeVerseNumbers: true,
    includeReferences: true,
    includeCopyright: false,
    oneVersePerLine: true,
  };
  const markdown = createMarkdown(options, RESULT);
  const clipboard = createClipboardText(options, RESULT);

  assert.match(markdown, /\[16\] For God so loved the world {2}\n\[17\]/);
  assert.match(clipboard, /\[16\] For God so loved the world\n\[17\]/);
});

check("turning references off removes the label but keeps the verse", () => {
  const markdown = createMarkdown(
    { includeReferences: false, includeCopyright: false, includeVerseNumbers: true },
    RESULT,
  );

  assert.doesNotMatch(markdown, /\(NLT\)/, "the reference survived the switch");
  assert.match(markdown, /\[16\] For God so loved the world/);
});

check("copyright is preview-only and never copied", () => {
  const options = { includeCopyright: true, includeReferences: true };
  const markdown = createMarkdown(options, RESULT);
  const clipboard = createClipboardText(options, RESULT);

  assert.match(markdown, /Copyright © 1996/);
  assert.doesNotMatch(clipboard, /Copyright|Tyndale/);
  assert.doesNotMatch(clipboard, /---/);
});

check("the clipboard separates passages and puts the reference on its own line", () => {
  const twoPassages: ReferenceSearchResult = {
    ...RESULT,
    passages: [
      RESULT.passages[0],
      { reference: "Psalm 23:1", verses: [{ chapter: 23, verse: 1, text: "The LORD is my shepherd" }] },
    ],
  };
  const clipboard = createClipboardText(
    { includeReferences: true, includeVerseNumbers: true },
    twoPassages,
  );
  const markdown = createMarkdown(
    { includeReferences: true, includeCopyright: false },
    twoPassages,
  );

  assert.equal(
    clipboard,
    "[16] For God so loved the world [17] God did not send his Son\n" +
      "John 3:16 (NLT)\n\n" +
      "[1] The LORD is my shepherd\nPsalm 23:1 (NLT)",
  );
  assert.match(markdown, /John 3:16 \(NLT\)\n\nThe LORD is my shepherd/);
});

check("a passage whose text is already a string is shown as it came", () => {
  const whole: ReferenceSearchResult = {
    version: "King James Version (KJV)",
    copyright: "",
    passages: [{ reference: "Psalm 23", verses: "The LORD is my shepherd; I shall not want." }],
  };

  assert.equal(
    createClipboardText({ includeReferences: false }, whole),
    "The LORD is my shepherd; I shall not want.",
  );
  assert.match(createMarkdown({ includeReferences: true }, whole), /Psalm 23 \(KJV\)$/);
});

check("a Russian book name is translated into the name the site accepts", () => {
  assert.equal(normalizeQuery("Иоанн 3:16"), "John 3:16");
  assert.equal(normalizeQuery("иоанна 3:16"), "John 3:16");
  assert.equal(normalizeQuery("1 Кор 13:4"), "1 Corinthians 13:4");
  assert.equal(normalizeQuery("1Кор 13:4"), "1 Corinthians 13:4");
  assert.equal(normalizeQuery("Пс 23"), "Psalms 23");
  assert.equal(normalizeQuery("Песнь Песней 2:1"), "Song of Solomon 2:1");
  assert.equal(normalizeQuery("Иисус Навин 10:13"), "Joshua 10:13");
  assert.equal(normalizeQuery("Ин 3:16, Пс 23:1"), "John 3:16, Psalms 23:1");
  // English input and an unknown word are the user's own query, not a lookup.
  assert.equal(normalizeQuery("John 3:16"), "John 3:16");
  assert.equal(normalizeQuery("Неизвестная 1:1"), "Неизвестная 1:1");
  assert.equal(normalizeQuery(""), "");
});

check("a reference is shown in Russian only for a Russian version", () => {
  assert.equal(isRussianVersion("Russian Synodal Version (RUSV)"), true);
  assert.equal(isRussianVersion("New Russian Translation (NRT)"), true);
  assert.equal(isRussianVersion("New Living Translation (NLT)"), false);

  assert.equal(localizeReference("John 3:16", "Russian Synodal Version (RUSV)"), "Иоанна 3:16");
  assert.equal(localizeReference("1Sam 2:3", "Russian Synodal Version (RUSV)"), "1 Царств 2:3");
  assert.equal(
    localizeReference("Ps 23:1-Ps 23:6", "Russian Synodal Version (RUSV)"),
    "Псалтирь 23:1-Псалтирь 23:6",
  );
  // Non-Russian versions keep the English reference the parser produced.
  assert.equal(localizeReference("John 3:16", "New Living Translation (NLT)"), "John 3:16");
});

check("a Russian version shows the reference in Russian, preview and clipboard", () => {
  const russian: ReferenceSearchResult = { ...RESULT, version: "Russian Synodal Version (RUSV)" };
  const options = { includeReferences: true, includeCopyright: false };

  assert.match(createMarkdown(options, russian), /Иоанна 3:16 \(RUSV\)/);
  assert.match(createClipboardText(options, russian), /Иоанна 3:16 \(RUSV\)$/);
});

check("a range keeps both ends of the reference", () => {
  assert.equal(osisToReference("Ps.23.1-Ps.23.6"), "Ps 23:1-Ps 23:6");
  assert.equal(osisToReference("John.3.16-John.3.18"), "John 3:16-John 3:18");
});

check("a Russian query finds the passage the site would not accept", async () => {
  let result: ReferenceSearchResult;
  try {
    result = await search("Иоанн 3:16", "RUSV");
  } catch (error) {
    throw new Skip(
      `biblegateway.com did not answer: ${error instanceof Error ? error.message : error}`,
    );
  }

  assert.equal(result.passages.length, 1, "the translated query found nothing");
  assert.equal(result.passages[0].reference, "John 3:16");
  assert.match(result.passages[0].verses[0]?.text ?? "", /Ибо так возлюбил Бог/);
  assert.equal(
    localizeReference(result.passages[0].reference, result.version),
    "Иоанна 3:16",
    "the displayed reference stayed English",
  );
});

check("a live search still parses the page the site serves", async () => {
  let result: ReferenceSearchResult;
  try {
    result = await search("John 3:16", "NRSVUE");
  } catch (error) {
    // Offline, DNS failure, or the site refusing this client: nothing to observe.
    throw new Skip(
      `biblegateway.com did not answer: ${error instanceof Error ? error.message : error}`,
    );
  }

  assert.equal(result.passages.length, 1, "the live page no longer holds one passage");
  assert.equal(result.passages[0].reference, "John 3:16");
  assert.equal(result.passages[0].verses[0]?.chapter, 3);
  assert.equal(result.passages[0].verses[0]?.verse, 16);
  assert.match(result.version, /\(NRSVUE\)$/, "the live version line was not read");
  assert.match(result.copyright, /Copyright/, "the live copyright line was not read");
  assert.equal(result.url?.searchParams.has("interface"), false, "the print flag leaked into the URL");
});

(async () => {
  for (const [name, body] of checks) {
    try {
      await body();
      passed += 1;
      console.log(`ok   ${name}`);
    } catch (error) {
      if (error instanceof Skip) {
        skipped += 1;
        console.log(`SKIP ${name} — ${error.message}`);
        continue;
      }
      failed += 1;
      console.log(`FAIL ${name}`);
      console.log(`     ${error instanceof Error ? error.message : error}`);
    }
  }

  const summary = `${passed} passed, ${failed} failed, ${skipped} skipped`;
  console.log(`\n${failed > 0 || skipped > 0 ? summary : `all ${passed} checks passed`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
