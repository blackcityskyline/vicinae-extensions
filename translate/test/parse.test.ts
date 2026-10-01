import assert from "node:assert/strict";

import { parseTranslation } from "../src/api/google.ts";

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

// Every fixture below is a real body captured from the endpoint, not a shape
// invented here. Sources are named in docs/audits/translate.md.

/** `q=hello&sl=en&tl=ru`, the full data-type set. */
const WORD = JSON.parse(`[
  [["привет","hello",null,null,10],[null,null,"privet","həˈlō"]],
  [
    ["глагол",["здороваться","звать","окликать"],
      [["здороваться",["greet","hello","salute","hallo"],null,0.0028530264],
       ["звать",["call","invite","shout","hail"],null,2.753645e-05],
       ["окликать",["hail","holler","call"],null,2.753645e-05]],
      "hello",2],
    ["имя существительное",["приветствие","возглас удивления"],
      [["приветствие",["greeting","salutation"],null,0.001],["возглас удивления",["cry of surprise"],null,1e-06]],
      "hello",1]
  ],
  "en",
  null,
  null,
  [["hello",null,[["привет",null,true,false,[10]],["приветствовать",null,true,false,[10]],["Здравствуйте",null,true,false,[10]]],[[0,5]],"hello",0,0]],
  1,
  [],
  [["en"],null,[1],["en"]],
  null,null,null,
  [["восклицание",[["used as a greeting or to begin a phone conversation.","m_en_gbus0460730.012","hello there, Katie!"]],"hello",17],
   ["глагол",[["say or shout \\u201chello\\u201d; greet someone.","m_en_gbus0460730.034","I pressed the phone button"]],"hello",1]],
  [[["<b>hello</b> there, Katie!",null,null,null,null,"m_en_gbus0460730.012"]]]
]`);

/** `q=helo world&sl=auto&tl=ru`, a typo. Body 7 is the correction. */
const TYPO = JSON.parse(`[
  [["привет мир","helo world",null,null,3,null,null,[[]],[[["8e6adaf1f9ae06bcb9663531e5521abb","en_ru_2023q1.md"]]]],
   [null,null,"privet mir"]],
  null,
  "en",
  null,
  null,
  null,
  null,
  ["<b><i>hello</i></b> world","hello world",[1]]
]`);

/** `q=Good morning, how are you?&sl=auto&tl=ru`. Two body 7 elements here, not one. */
const SENTENCE = JSON.parse(`[
  [["Доброе утро, как дела?","Good morning, how are you?",null,null,3,null,null,[[]],[[["8e6adaf1f9ae06bcb9663531e5521abb","en_ru_2023q1.md"]]]],
   [null,null,"Dobroye utro, kak dela?"]],
  null,
  "en"
]`);

check("the translation and the transliteration are read out of the first slot", () => {
  const t = parseTranslation(WORD, "en", "ru");
  assert.equal(t.text, "привет");
  assert.equal(t.transliteration, "privet");
  assert.equal(t.phonetic, "həˈlō");
  assert.equal(t.from, "en");
  assert.equal(t.to, "ru");
});

check("the detected source language wins over the requested one", () => {
  // Asked for auto, answered "en". The badge must say English, not Auto-Detect,
  // or the user cannot tell what was actually translated.
  assert.equal(parseTranslation(SENTENCE, "auto", "ru").from, "en");
});

check("a sentence has no phonetic transcription and that is not an error", () => {
  const t = parseTranslation(SENTENCE, "auto", "ru");
  assert.equal(t.text, "Доброе утро, как дела?");
  assert.equal(t.transliteration, "Dobroye utro, kak dela?");
  assert.equal(t.phonetic, undefined);
});

check("a typo is corrected, and the markup is not shown", () => {
  const t = parseTranslation(TYPO, "auto", "ru");
  assert.equal(t.text, "привет мир");
  assert.equal(t.corrected, "hello world");
  assert.ok(!t.corrected?.includes("<b>"), "the <b><i> markup leaked through");
});

check("text that was not corrected does not claim to have been", () => {
  assert.equal(parseTranslation(WORD, "en", "ru").corrected, undefined);
  assert.equal(parseTranslation(SENTENCE, "auto", "ru").corrected, undefined);
});

check("the dictionary comes back grouped by part of speech", () => {
  const t = parseTranslation(WORD, "en", "ru");
  assert.equal(t.synonyms.length, 2);
  assert.equal(t.synonyms[0]?.partOfSpeech, "глагол");
  assert.deepEqual(
    t.synonyms[0]?.words.map((w) => w.word),
    ["здороваться", "звать", "окликать"],
  );
});

check("synonyms are ordered by how strongly Google means them", () => {
  const t = parseTranslation(WORD, "en", "ru");
  // Within a group, strongest first. Across groups, by the strongest word in the
  // group — so the whole list is not monotonic, and pretending it is would be a
  // test of nothing.
  for (const group of t.synonyms) {
    const scores = group.words.map((w) => w.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), group.partOfSpeech);
  }
  assert.equal(t.synonyms[0]?.partOfSpeech, "глагол", "the strongest group should come first");
  assert.equal(t.synonyms[0]?.words[0]?.word, "здороваться");
});

check("examples come back as alternatives for the same word", () => {
  const t = parseTranslation(WORD, "en", "ru");
  assert.deepEqual(t.examples, ["привет", "приветствовать", "Здравствуйте"]);
});

check("definitions keep their part of speech and their example sentence", () => {
  const t = parseTranslation(WORD, "en", "ru");
  assert.equal(t.definitions.length, 2);
  assert.equal(t.definitions[0]?.partOfSpeech, "восклицание");
  assert.equal(t.definitions[0]?.text, "used as a greeting or to begin a phone conversation.");
  assert.equal(t.definitions[0]?.example, "hello there, Katie!");
});

check("a sentence has no dictionary and does not pretend to", () => {
  const t = parseTranslation(SENTENCE, "auto", "ru");
  assert.deepEqual(t.synonyms, []);
  assert.deepEqual(t.examples, []);
  assert.deepEqual(t.definitions, []);
});

check("a body with only the translations does not throw", () => {
  // Measured: asking for fewer data types returns a shorter body, and a plain
  // translation of a long paragraph comes back with three slots only.
  const t = parseTranslation([[["привет", "hello", null, null, 3]]], "en", "ru");
  assert.equal(t.text, "привет");
  assert.deepEqual(t.synonyms, []);
  assert.deepEqual(t.examples, []);
  assert.deepEqual(t.definitions, []);
  assert.equal(t.corrected, undefined);
});

check("a body that is not a body at all is an error in words", () => {
  // Measured: a bad request answers HTML, and json() hands that back as a string.
  assert.throws(() => parseTranslation("<html>Error 400</html>", "en", "ru"), /Google/);
  assert.throws(() => parseTranslation({ error: 400 }, "en", "ru"), /Google/);
});

console.log(`\nall ${checks} checks passed`);