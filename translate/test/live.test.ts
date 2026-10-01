import assert from "node:assert/strict";

import { GoogleError, translate } from "../src/api/google.ts";
import { ENDPOINT, translateRequest } from "../src/utils/request.ts";
import { languageName } from "../src/utils/languages.ts";

/**
 * Checks against the live endpoint. There is no key and no token, so these are
 * not optional extras — they are the only thing that proves the port works.
 *
 * A skip is not a pass and is reported separately.
 */

let checks = 0;

async function check(name: string, body: () => Promise<void> | void) {
  try {
    await body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

async function main() {
  await check("a word comes back translated, with the source detected", async () => {
    const result = await translate("hello", "auto", "ru");
    assert.equal(result.text, "привет");
    assert.equal(result.from, "en", "the source language was not detected");
    assert.equal(result.to, "ru");
  });

  await check("a whole sentence comes back translated", async () => {
    const result = await translate("Good morning, how are you?", "auto", "ru");
    assert.match(result.text, /Доброе утро/);
    assert.ok(result.text.length > 10, `answer was too short: ${result.text}`);
  });

  await check("the dictionary arrives, which is what the data-type list is for", async () => {
    const result = await translate("hello", "auto", "ru");
    assert.ok(result.synonyms.length > 0, "no synonyms came back");
    assert.ok(result.synonyms.every((group) => group.words.length > 0));
    assert.ok(result.examples.length > 0, "no examples came back");
  });

  await check("every synonym carries the score it was ranked by", async () => {
    const result = await translate("hello", "auto", "ru");
    for (const group of result.synonyms) {
      assert.ok(
        group.words.every((word) => word.word.length > 0 && Number.isFinite(word.score)),
        JSON.stringify(group),
      );
    }
  });

  await check("a typo is corrected rather than translated as written", async () => {
    const result = await translate("helo world", "auto", "ru");
    assert.equal(result.corrected, "hello world");
  });

  await check("nothing that is asked for comes back empty", async () => {
    const result = await translate("hello", "auto", "ru");
    assert.ok(result.text.length > 0, "no translation");
    assert.ok(result.transliteration, "no transliteration for a Cyrillic answer");
  });

  await check("a language we do not know is refused in words, not echoed back", async () => {
    // Measured without the guard: `tl=xx` answers 200 with the input unchanged.
    await assert.rejects(() => translate("hello", "auto", "xx"), GoogleError);
  });

  await check("a long text goes out as a POST and comes back whole", async () => {
    const long = "the quick brown fox jumps over the lazy dog. ".repeat(60);
    const request = translateRequest(long, "en", "ru");
    assert.equal(request.method, "POST");

    const result = await translate(long, "en", "ru");
    assert.match(result.text, /Быстрая бурая лиса/i);
    assert.ok(result.text.length > 500, `only ${result.text.length} characters came back`);
  });

  await check("the endpoint answers with no token at all", async () => {
    // Upstream fetches three megabytes of HTML to compute a `tk` out of a pattern
    // Google has deleted. Measured: the request works without one, and this is the
    // check that would notice if it ever stopped.
    const url = new URL(translateRequest("hello", "auto", "ru").url);
    assert.equal(url.searchParams.has("tk"), false);

    const response = await fetch(url);
    assert.equal(response.status, 200);
  });

  await check("ten requests at once all answer", async () => {
    // Upstream fans out one request per target language on every keystroke, so this
    // is the shape it actually produces while someone is typing.
    const answers = await Promise.all(
      Array.from({ length: 10 }, (_, index) => translate(`hello world ${index}`, "en", "ru")),
    );
    for (const answer of answers) assert.ok(answer.text.length > 0);
    assert.ok(new Set(answers.map((answer) => answer.text)).size > 1, "all ten answers were the same");
  });

  await check("translating to the language it is already in is not an error", async () => {
    // Measured: `tl=ru` on Russian text answers 200 with the text unchanged. That is
    // a correct answer, so it must not be confused with a mistyped language.
    const result = await translate("привет", "auto", "ru");
    assert.ok(result.text.length > 0);
  });

  await check("a language code we know has a name, and an odd one still renders", async () => {
    assert.equal(languageName("en"), "English");
    assert.equal(languageName("ru"), "Russian");
    // Google answers with codes the table has never heard of, and a row must render.
    assert.equal(languageName("qqq"), "qqq");
  });

  await check("the website link is the one that answers", async () => {
    const response = await fetch(`https://translate.google.com/?${new URLSearchParams({ sl: "auto", tl: "ru", text: "hello", op: "translate" })}`);
    assert.equal(response.status, 200);
    assert.ok(ENDPOINT.startsWith("https://translate.google.com/"));
  });

  console.log(`\n${checks} checks passed`);
  if (checks === 0) {
    console.log("nothing was checked");
    process.exitCode = 1;
  }
}

void main();
