import assert from "node:assert/strict";

import { detailMarkdown, keywordsFor } from "../src/utils/result.ts";
import type { Translation } from "../src/api/google.ts";

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

const word: Translation = {
  text: "привет",
  transliteration: "privet",
  phonetic: "həˈlō",
  from: "en",
  to: "ru",
  synonyms: [
    { partOfSpeech: "глагол", words: [{ word: "здороваться", score: 0.0028 }, { word: "звать", score: 0.000027 }] },
    { partOfSpeech: "имя существительное", words: [{ word: "приветствие", score: 0.001 }] },
  ],
  examples: ["привет", "приветствовать"],
  definitions: [
    { partOfSpeech: "восклицание", text: "used as a greeting.", example: "hello there, Katie!" },
  ],
};

const sentence: Translation = {
  text: "Доброе утро, как дела?",
  transliteration: "Dobroye utro, kak dela?",
  from: "en",
  to: "ru",
  synonyms: [],
  examples: [],
  definitions: [],
};

check("the translation is the first thing in the panel", () => {
  assert.ok(detailMarkdown("hello", word).startsWith("# привет"), detailMarkdown("hello", word));
});

check("the original text is in the panel, because the panel is all there is", () => {
  // Upstream never shows the source anywhere: not in the title, not in the
  // detail. The detail is what you read when you arrow into a row.
  assert.match(detailMarkdown("hello", word), /hello/);
});

check("the transcription is shown when there is one", () => {
  assert.match(detailMarkdown("hello", word), /privet/);
  assert.match(detailMarkdown("hello", word), /həˈlō/);
});

check("a missing phonetic line leaves nothing dangling", () => {
  const markdown = detailMarkdown("hello", sentence);
  assert.match(markdown, /Dobroye utro/);
  assert.ok(!markdown.includes("·"), "an empty pair of separators was left behind");
});

check("a correction is stated in words", () => {
  const markdown = detailMarkdown("helo world", { ...word, text: "привет мир", corrected: "hello world" });
  assert.match(markdown, /hello world/);
  assert.match(markdown, /mean/i);
});

check("synonyms keep their part of speech", () => {
  const markdown = detailMarkdown("hello", word);
  assert.match(markdown, /глагол/);
  assert.match(markdown, /имя существительное/);
  assert.match(markdown, /здороваться/);
});

check("definitions keep their example sentence", () => {
  const markdown = detailMarkdown("hello", word);
  assert.match(markdown, /used as a greeting\./);
  assert.match(markdown, /hello there, Katie!/);
});

check("nothing empty is ever rendered", () => {
  // The failure this guards against: a heading with nothing under it, or a
  // separator left behind by a field that was absent. A word without a
  // dictionary is the normal case, not the exception.
  const markdown = detailMarkdown("Good morning, how are you?", sentence);

  for (const heading of ["Examples", "Synonyms", "Definitions"]) {
    assert.ok(!markdown.includes(heading), `${heading} was rendered with nothing under it`);
  }
  assert.ok(!/\n#+\s*$/m.test(markdown), "a heading was left at the end with no body");
  assert.ok(!/[:：]\s*$/m.test(markdown), "a label was left with nothing after it");
  assert.ok(!/\n{3,}/.test(markdown), "blank runs were left behind");
});

check("the filter can find a row by the text that was typed", () => {
  // This is what makes the list stop emptying as you type. The list filters on
  // these, and the title is the translation — without the source in here, typing
  // "hello" hides every Russian row.
  const keywords = keywordsFor("hello", word);
  assert.ok(keywords.includes("hello"), "the typed text is not searchable");
  assert.ok(keywords.includes("привет"), "the translation is not searchable");
  assert.ok(keywords.includes("здороваться"), "a synonym is not searchable");
});

check("keywords carry nothing empty", () => {
  const keywords = keywordsFor("hello", sentence);
  assert.ok(keywords.every((k) => k.trim().length > 0), JSON.stringify(keywords));
  assert.deepEqual([...new Set(keywords)], keywords, "there is a duplicate");
});

console.log(`\nall ${checks} checks passed`);