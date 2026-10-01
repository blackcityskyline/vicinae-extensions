import assert from "node:assert/strict";

import { isSameLanguage } from "../src/api/google.ts";
import { formatLanguageSet, isSameLanguageSet, websiteUrl } from "../src/utils.ts";

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

check("a region does not make a different language", () => {
  assert.equal(isSameLanguage("en", "en"), true);
  assert.equal(isSameLanguage("en", "en-GB"), true);
  assert.equal(isSameLanguage("EN", "en-gb"), true);
  assert.equal(isSameLanguage("zh-CN", "zh-TW"), true, "both are Chinese");
  assert.equal(isSameLanguage("en", "ru"), false);
});

check("nothing is the same as nothing", () => {
  // The reference guards this, and it matters: a missing language reaching the
  // comparison used to make every result look like a same-language result.
  assert.equal(isSameLanguage("", "en"), false);
  assert.equal(isSameLanguage("en", ""), false);
});

check("a language set is the same when both halves are", () => {
  const one = { langFrom: "auto", langTo: ["en", "de"] };
  assert.equal(isSameLanguageSet(one, { langFrom: "auto", langTo: ["en", "de"] }), true);
  assert.equal(isSameLanguageSet(one, { langFrom: "auto", langTo: ["de", "en"] }), false, "order is part of it");
  assert.equal(isSameLanguageSet(one, { langFrom: "en", langTo: ["en", "de"] }), false);
});

check("a language set reads the way the dropdown shows it", () => {
  assert.equal(formatLanguageSet({ langFrom: "auto", langTo: ["en", "de"] }), "Auto-Detect -> English, German");
  assert.equal(formatLanguageSet({ langFrom: "ru", langTo: ["en"] }), "Russian -> English");
});

check("a language the table has never heard of still reads as something", () => {
  // Google detects codes the 249-entry table does not carry. The reference indexes
  // the table and reads `.name` off the result, which throws.
  assert.equal(formatLanguageSet({ langFrom: "qqq", langTo: ["zzz"] }), "qqq -> zzz");
});

check("the website link is built by encoding, never by pasting", () => {
  const url = new URL(websiteUrl("auto", "ru", "a & b ? c = d"));
  assert.equal(url.host, "translate.google.com");
  assert.equal(url.searchParams.get("sl"), "auto");
  assert.equal(url.searchParams.get("tl"), "ru");
  assert.equal(url.searchParams.get("text"), "a & b ? c = d");
  assert.equal(url.searchParams.get("op"), "translate");
  assert.equal(url.searchParams.get("b"), null);
});

console.log(`\nall ${checks} checks passed`);