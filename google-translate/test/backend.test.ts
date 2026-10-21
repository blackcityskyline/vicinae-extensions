import assert from "node:assert/strict";

import { doubleWayTranslate, multiTranslate, simpleTranslate, TranslateError } from "../src/simple-translate.ts";

/**
 * The backend check: the extension is a thin layer over
 * translate.googleapis.com, so this drives that endpoint instead of a fixture.
 *
 * Nothing here needs an account or a key, so every check runs everywhere —
 * including CI. `rich.test.ts` proves the parser against captured responses;
 * this proves the request that produces them, and that the slots the parser
 * reads are still filled by the endpoint.
 *
 * A rate limit is not a broken client: the endpoint answers a burst with 429,
 * which the extension rethrows as `TranslateError` named "Too many requests".
 * That turns the remaining checks into SKIP, because nothing was observed.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

class RateLimited extends Error {}

function skip(name: string, reason: string): void {
  skipped += 1;
  console.log(`SKIP ${name} (${reason})`);
}

async function check(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    if (error instanceof RateLimited) {
      skip(name, error.message);
      return;
    }
    failed += 1;
    console.log(`FAIL ${name}`);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

/** Runs a request, turning Google's rate limit into a skip and everything else into a failure. */
async function request<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TranslateError && error.name === "Too many requests") {
      throw new RateLimited("the endpoint rate-limited this run");
    }
    throw error;
  }
}

const CYRILLIC = /[\u0400-\u04FF]/;

async function main(): Promise<void> {
  await check("a word is translated between two named languages", async () => {
    const result = await request(() => simpleTranslate("hello", { langFrom: "en", langTo: ["ru"] }));
    assert.equal(result.originalText, "hello");
    assert.equal(result.langFrom, "en");
    assert.equal(result.langTo, "ru");
    assert.match(result.translatedText, CYRILLIC, `the answer is not Russian: ${result.translatedText}`);
    console.log(`     ${result.translatedText}`);
  });

  await check("the source language is detected when it is not given", async () => {
    const result = await request(() => simpleTranslate("привет", { langFrom: "auto", langTo: ["en"] }));
    assert.equal(result.langFrom, "ru", `detection said ${result.langFrom}`);
    assert.match(result.translatedText, /hello/i, `the answer is not English: ${result.translatedText}`);
  });

  await check("the dictionary slots come back filled by the endpoint", async () => {
    const result = await request(() => simpleTranslate("hello", { langFrom: "en", langTo: ["ru"] }));
    assert.ok(result.rich.synonyms.length > 0, "slot 1 carried no synonyms");
    assert.ok(result.rich.definitions.length > 0, "slot 12 carried no definitions");
    console.log(
      `     ${result.rich.synonyms.length} synonym groups, ${result.rich.definitions.length} definitions`,
    );
  });

  await check("a target that equals the source steps aside for the next one", async () => {
    const result = await request(() => simpleTranslate("hello", { langFrom: "en", langTo: ["en", "ru"] }));
    assert.equal(result.langTo, "ru", "a same-language answer was returned instead of the fallback");
    assert.match(result.translatedText, CYRILLIC, `the answer is not Russian: ${result.translatedText}`);
  });

  await check("a detected source that equals the target also steps aside", async () => {
    const result = await request(() => simpleTranslate("hello", { langFrom: "auto", langTo: ["en", "ru"] }));
    assert.equal(result.langFrom, "en", `detection said ${result.langFrom}`);
    assert.equal(result.langTo, "ru", "a same-language answer was returned instead of the fallback");
  });

  await check("several targets come back in the order they were configured", async () => {
    const results = await request(() => multiTranslate("good morning", { langFrom: "en", langTo: ["ru", "de"] }));
    assert.equal(results.length, 2, "one target produced no result");
    assert.deepEqual(
      results.map((result) => result.langTo),
      ["ru", "de"],
    );
    assert.ok(
      results.every((result) => result.translatedText.length > 0),
      "a target came back empty",
    );
  });

  await check("a same-language result is moved last when asked", async () => {
    const results = await request(() =>
      multiTranslate("morning", { langFrom: "en", langTo: ["en", "ru"], prioritizeCrossLanguage: true }),
    );
    assert.deepEqual(
      results.map((result) => result.langTo),
      ["ru", "en"],
    );
  });

  await check("both directions are translated", async () => {
    const results = await request(() => doubleWayTranslate("hello", { langFrom: "en", langTo: ["ru"] }));
    assert.equal(results.length, 2, "the reverse direction is missing");
    assert.equal(results[0].langTo, "ru");
    assert.equal(results[1].langTo, "en");
    assert.match(results[0].translatedText, CYRILLIC, "the forward direction is not Russian");
  });

  await check("an empty text never reaches the network", async () => {
    const result = await simpleTranslate("", { langFrom: "en", langTo: ["ru"] });
    assert.equal(result.translatedText, "");
    assert.equal(result.originalText, "");
    assert.deepEqual(await multiTranslate("", { langFrom: "en", langTo: ["ru"] }), []);
  });

  console.log(`\npassed: ${passed}, failed: ${failed}, skipped: ${skipped}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
