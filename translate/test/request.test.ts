import assert from "node:assert/strict";

import { POST_THRESHOLD, translateRequest } from "../src/utils/request.ts";

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

check("the url is the one measured answering 200", () => {
  const { url } = translateRequest("hello", "auto", "ru");
  const parsed = new URL(url);
  assert.equal(parsed.host, "translate.google.com");
  assert.equal(parsed.pathname, "/translate_a/single");
  assert.equal(parsed.searchParams.get("client"), "dict-chrome-ex");
  assert.equal(parsed.searchParams.get("sl"), "auto");
  assert.equal(parsed.searchParams.get("tl"), "ru");
  assert.equal(parsed.searchParams.get("q"), "hello");
});

check("every data type is asked for, or the dictionary never arrives", () => {
  // Measured: dt=t alone fills only the translations and the detected language.
  // dt=t,bd adds the dictionary, dt=t,at adds the examples. The definitions need
  // md. Sending fewer means the response is shorter but still a 200, so nothing
  // would ever tell you what was missing.
  const { url } = translateRequest("hello", "auto", "ru");
  const asked = new URL(url).searchParams.getAll("dt").sort();
  assert.deepEqual(asked, ["at", "bd", "ex", "ld", "md", "qca", "rm", "rw", "ss", "t"]);
});

check("no token is sent, because Google dropped the one there was", () => {
  // The endpoint answers 200 with no tk at all. Upstream fetches three megabytes
  // of HTML to compute one out of a `tkk:'…'` pattern that is no longer there.
  const { url } = translateRequest("hello", "auto", "ru");
  assert.equal(new URL(url).searchParams.has("tk"), false);
});

check("the text is encoded, never pasted", () => {
  const { url } = translateRequest("a & b ? c = d # e", "en", "ru");
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("q"), "a & b ? c = d # e");
  // Nothing after the first "?" may be read as another parameter.
  assert.equal(parsed.searchParams.get("b"), null);
  assert.equal(parsed.searchParams.get("c"), null);
});

check("short text goes out as a GET", () => {
  const request = translateRequest("hello", "auto", "ru");
  assert.equal(request.method, "GET");
  assert.equal(request.body, undefined);
  assert.ok(request.url.length < POST_THRESHOLD);
});

check("text that would make the url too long goes out as a POST", () => {
  // Measured: 2700 characters in the body translate fine, and the url cannot pass
  // 2048 characters with the text in it.
  const long = "the quick brown fox jumps over the lazy dog. ".repeat(60);
  const request = translateRequest(long, "en", "ru");

  assert.equal(request.method, "POST");
  assert.ok(request.url.length < POST_THRESHOLD, `url is ${request.url.length}`);
  assert.equal(new URL(request.url).searchParams.has("q"), false, "the text stayed in the url");

  const body = new URLSearchParams(request.body ?? "");
  assert.equal(body.get("q"), long);
  // Everything but the text has to survive the move into the body.
  assert.equal(new URL(request.url).searchParams.get("tl"), "ru");
});

check("the switch happens at the threshold, not before it", () => {
  const filler = "a".repeat(POST_THRESHOLD);
  assert.equal(translateRequest(filler, "en", "ru").method, "POST");
  assert.equal(translateRequest(filler.slice(0, 100), "en", "ru").method, "GET");
});

console.log(`\nall ${checks} checks passed`);