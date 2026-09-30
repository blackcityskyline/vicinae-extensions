import assert from "node:assert/strict";

import { decodeUrl, looksLikeUrl, readShortLink, withScheme } from "../src/utils/url.ts";

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
    console.log(`     ${(error as Error).message.split("\n").slice(0, 6).join("\n     ")}`);
  }
}

// ---------------------------------------------------------------------------
// decodeUrl. The point of this function is the `+` rule: inside a query string
// `+` is a space, everywhere else it is a literal plus.
// ---------------------------------------------------------------------------

check("percent escapes decode to plain ASCII", () => {
  assert.equal(decodeUrl("hello%20world"), "hello world");
  assert.equal(decodeUrl("a%2Bb"), "a+b");
});

check("percent escapes decode to Cyrillic", () => {
  assert.equal(decodeUrl("%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82"), "привет");
});

check("query values read + as a space", () => {
  assert.equal(decodeUrl("https://x.dev/s?q=a+b&r=1"), "https://x.dev/s?q=a b&r=1");
});

check("a plus outside the query stays a plus", () => {
  assert.equal(decodeUrl("https://x.dev/a+b?q=1"), "https://x.dev/a+b?q=1");
  assert.equal(decodeUrl("https://x.dev/p#a+b"), "https://x.dev/p#a+b");
});

check("repeated query keys keep their order and duplicates", () => {
  assert.equal(decodeUrl("https://x.dev/s?a=1&b=2&a=3"), "https://x.dev/s?a=1&b=2&a=3");
});

check("an encoded hash inside a value is not treated as a fragment", () => {
  assert.equal(decodeUrl("https://x.dev/s?q=%23anchor"), "https://x.dev/s?q=#anchor");
});

check("a fragment is decoded and a query keeps whatever follows it", () => {
  assert.equal(decodeUrl("https://x.dev/s?a=1#%D0%BF"), "https://x.dev/s?a=1#п");
  assert.equal(decodeUrl("https://x.dev/s#%D1%82")  , "https://x.dev/s#т");
});

check("text with no escapes is returned unchanged", () => {
  assert.equal(decodeUrl("plain text"), "plain text");
  assert.equal(decodeUrl("https://x.dev/s?a=1"), "https://x.dev/s?a=1");
});

check("malformed escapes throw a message a user can act on", () => {
  assert.throws(() => decodeUrl("%zz"), /percent-encoding/i);
  assert.throws(() => decodeUrl("%E0%A4%A"), /percent-encoding/i);
  // A lone percent is the common case: pasting half a URL.
  assert.throws(() => decodeUrl("https://x.dev/100%"), /percent-encoding/i);
});

// ---------------------------------------------------------------------------
// looksLikeUrl guards what leaves the machine: only a URL is sent to TinyURL,
// so prose or a token sitting in the clipboard is never uploaded by accident.
// ---------------------------------------------------------------------------

check("a URL with a scheme is recognised", () => {
  assert.equal(looksLikeUrl("https://example.com/a?b=c"), true);
  assert.equal(looksLikeUrl("http://example.com"), true);
  assert.equal(looksLikeUrl("ftp://example.com/x"), true);
  assert.equal(looksLikeUrl("HTTPS://EXAMPLE.COM"), true);
});

check("a bare domain is recognised", () => {
  assert.equal(looksLikeUrl("example.com"), true);
  assert.equal(looksLikeUrl("www.example.com/a"), true);
  assert.equal(looksLikeUrl("example.co.uk/path"), true);
});

check("prose, tokens and empty clipboard contents are not URLs", () => {
  assert.equal(looksLikeUrl("hello world"), false);
  assert.equal(looksLikeUrl("Authorization: Bearer ghp_abc123"), false);
  assert.equal(looksLikeUrl("sk-1234567890abcdef"), false);
  assert.equal(looksLikeUrl(""), false);
  assert.equal(looksLikeUrl("   "), false);
});

// A schemeless name cannot be told apart from a filename, and guessing wrong
// the other way would refuse every pasted `example.com`. The ambiguity is
// accepted on purpose: what the guard has to stop is prose and tokens, and a
// filename is neither.
check("a schemeless filename is indistinguishable from a domain and is accepted", () => {
  assert.equal(looksLikeUrl("report.pdf"), true);
});

// ---------------------------------------------------------------------------
// withScheme. TinyURL answers 400 for a bare domain that has a path
// (`example.com/some/path` fails, `example.com` happens to pass), so the scheme
// is added rather than letting the request come back rejected.
// ---------------------------------------------------------------------------

check("a bare domain gains an https scheme", () => {
  assert.equal(withScheme("example.com/some/path"), "https://example.com/some/path");
  assert.equal(withScheme("example.com"), "https://example.com");
  assert.equal(withScheme("www.example.com/a?b=1"), "https://www.example.com/a?b=1");
});

check("a URL that already has a scheme is left alone", () => {
  assert.equal(withScheme("https://example.com/a"), "https://example.com/a");
  assert.equal(withScheme("HTTPS://EXAMPLE.COM"), "HTTPS://EXAMPLE.COM");
  assert.equal(withScheme("ftp://example.com/x"), "ftp://example.com/x");
  assert.equal(withScheme("  https://example.com  "), "https://example.com");
});

// ---------------------------------------------------------------------------
// readShortLink. TinyURL answers 200 with a bare URL, 400 with the body
// "Error", and an intercepted request with a whole HTML page.
// ---------------------------------------------------------------------------

check("a TinyURL response is accepted", () => {
  // Verbatim body of GET https://tinyurl.com/api-create.php?url=…
  assert.equal(readShortLink("https://tinyurl.com/265qx2zz"), "https://tinyurl.com/265qx2zz");
  assert.equal(readShortLink("https://tinyurl.com/265qx2zz\n"), "https://tinyurl.com/265qx2zz");
});

check("an error body or an HTML page is rejected", () => {
  assert.equal(readShortLink("Error"), null);
  assert.equal(readShortLink("<!DOCTYPE html><html>…"), null);
  assert.equal(readShortLink(""), null);
  assert.equal(readShortLink("https://evil.example/265qx2zz"), null);
  assert.equal(readShortLink("https://tinyurl.com/"), null);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
