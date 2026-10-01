import * as cheerio from "cheerio";

import type { BiblePassage, Verse } from "./types";

/**
 * Reading Bible Gateway's print page.
 *
 * Upstream's parser reads four things off the page, and **two of them are gone** as of
 * today. Measured on the bytes at `biblegateway.com/passage/?…&interface=print`:
 *
 *   .passage-table     1   present
 *   p .text           10   present — but all ten are `<span class="text">` in the
 *                          navigation menu, so counting them proves nothing
 *   sup.versenum       2   present, inside the verse
 *   .bcv               1   present only inside a <style> block, never as an element
 *   span.chapternum    0   gone
 *
 * So `reference` and `chapter` had nowhere to come from, and the result was a passage with
 * an empty reference and a NaN chapter. What replaced them:
 *
 *   <div class="passage-table" data-osis="John.3.16">
 *   <p><span class="text John-3-16"><sup class="versenum opening">16 </sup>For God so…
 *
 * `data-osis` carries book.chapter.verse, and the span's class carries the same triple in
 * a form that survives a book name containing digits ("1 Samuel 2:3" is `1-Samuel-2-3`).
 *
 * `test/parse.test.ts` runs all of this against the fetched page, not a sample written for
 * the test, and fails if the selectors ever come back.
 */

/** `John.3.16` -> `John 3:16`, `1Samuel.1.1` -> `1 Samuel 1:1`. */
export function osisToReference(osis: string): string {
  const parts = osis.split(".");
  if (parts.length < 3) return osis;

  const verse = parts.pop() as string;
  const chapter = parts.pop() as string;
  const book = parts.join(".");

  return `${book} ${chapter}:${verse}`;
}

/** `John-3-16` -> `{chapter: 3, verse: 16}`. Split from the right, for `1-Samuel-2-3`. */
export function referenceToChapterAndVerse(reference: string): { chapter: number; verse: number } {
  const parts = reference.split("-");
  return {
    chapter: Number(parts[parts.length - 2]),
    verse: Number(parts[parts.length - 1]),
  };
}

export function parsePassages(html: string): BiblePassage[] {
  const $ = cheerio.load(html);

  const passages: BiblePassage[] = [];

  $(".passage-table")
    .each((_, element) => {
      const passage = $(element);

      const osis = passage.attr("data-osis");
      if (!osis) return;

      const reference = osisToReference(osis);
      if (!reference) return;

      const verses: Verse[] = [];

      passage.find("p .text").each((__, textElement) => {
        const element = $(textElement);

        const classes = (element.attr("class") ?? "").split(/\s+/);
        const encoded = classes.find((name) => /^\d?[A-Za-z]+-/.test(name) && name.includes("-"));
        const numbers = encoded ? referenceToChapterAndVerse(encoded) : { chapter: NaN, verse: NaN };

        // The number is in a <sup>, and it is markup rather than text.
        element.find("sup").remove();
        const text = element.text().trim();

        if (!text) return;

        // Consecutive entries with the same number are one verse split across elements,
        // which poetry produces.
        const previous = verses[verses.length - 1];
        if (previous && previous.verse === numbers.verse) {
          previous.text += ` ${text}`;
          return;
        }

        verses.push({ chapter: numbers.chapter, verse: numbers.verse, text });
      });

      if (verses.length === 0) return;

      passages.push({ verses, reference });
    });

  // The same reference can arrive more than once for a multi-passage query.
  return passages.filter(
    (passage, index) => passages.findIndex((other) => other.reference === passage.reference) === index,
  );
}
