import assert from "node:assert/strict";

import { definitionsAsText, parseRich, synonymsAsText, NOTHING } from "../src/rich.ts";

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

/** `q=hello&sl=en&tl=ru` with the full `dt` list, captured from the endpoint. */
const WORD = JSON.parse(`[
  [["привет","hello",null,null,10],[null,null,"privet","həˈlō"]],
  [
    ["глагол",["здороваться","звать","окликать"],
      [["здороваться",["greet","hello","salute","hallo"],null,0.0028530264],
       ["звать",["call","invite","shout","hail"],null,2.753645e-05]],
      "hello",2],
    ["имя существительное",["приветствие","возглас удивления"],
      [["приветствие",["greeting","salutation"],null,0.001]],
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

/** `q=helo world&sl=auto&tl=ru`, a typo. Slot 7 is the correction. */
const TYPO = JSON.parse(`[
  [["привет мир","helo world",null,null,3,null,null,[[]],[[["8e6adaf1f9ae06bcb9663531e5521abb","en_ru_2023q1.md"]]]],
   [null,null,"privet mir"]],
  null,
  "en",null,null,null,null,
  ["<b><i>hello</i></b> world","hello world",[1]]
]`);

/** A whole paragraph: three slots, nothing else. The normal case. */
const PARAGRAPH = JSON.parse(`[
  [["Доброе утро, как дела?","Good morning, how are you?",null,null,3]],
  null,
  "en"
]`);

check("the dictionary comes back grouped by part of speech", () => {
  const rich = parseRich(WORD);
  assert.equal(rich.synonyms.length, 2);
  assert.equal(rich.synonyms[0]?.partOfSpeech, "глагол");
  assert.deepEqual(rich.synonyms[0]?.words.map((w) => w.word), ["здороваться", "звать"]);
});

check("the strongest synonym comes first", () => {
  const rich = parseRich(WORD);
  for (const group of rich.synonyms) {
    const scores = group.words.map((w) => w.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), group.partOfSpeech);
  }
  assert.equal(rich.synonyms[0]?.partOfSpeech, "глагол", "the strongest group leads");
});

check("the alternative renderings come back", () => {
  assert.deepEqual(parseRich(WORD).examples, ["привет", "приветствовать", "Здравствуйте"]);
});

check("definitions keep their part of speech and their example sentence", () => {
  const definitions = parseRich(WORD).definitions;
  assert.equal(definitions.length, 2);
  assert.equal(definitions[0]?.partOfSpeech, "восклицание");
  assert.equal(definitions[0]?.text, "used as a greeting or to begin a phone conversation.");
  assert.equal(definitions[0]?.example, "hello there, Katie!");
});

check("a typo is corrected and the markup is not shown", () => {
  const rich = parseRich(TYPO);
  assert.equal(rich.corrected, "hello world");
  assert.ok(!rich.corrected?.includes("<b>"), "the <b><i> markup leaked through");
});

check("text that was not corrected does not claim it was", () => {
  assert.equal(parseRich(WORD).corrected, undefined);
  assert.equal(parseRich(PARAGRAPH).corrected, undefined);
});

check("a paragraph has no dictionary and does not pretend to", () => {
  const rich = parseRich(PARAGRAPH);
  assert.deepEqual(rich.synonyms, []);
  assert.deepEqual(rich.examples, []);
  assert.deepEqual(rich.definitions, []);
});

check("a response that is not a response does not throw", () => {
  for (const body of ["<html>Error 400</html>", { error: 400 }, null, undefined, 42]) {
    assert.deepEqual(parseRich(body), NOTHING);
  }
});

check("the text helpers keep a line per entry", () => {
  const rich = parseRich(WORD);
  assert.equal(synonymsAsText(rich.synonyms).split("\n").length, 2);
  assert.match(synonymsAsText(rich.synonyms), /^глагол: /);
  assert.match(definitionsAsText(rich.definitions), /— hello there, Katie!$/m);
  assert.equal(synonymsAsText([]), "");
  assert.equal(definitionsAsText([]), "");
});

console.log(`\nall ${checks} checks passed`);