import assert from "node:assert/strict";

import { sandboxDocument } from "../src/utils/html.ts";

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

const GUARD = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'">`;

check("the guard blocks scripts, plugins and form submission", () => {
  const document = sandboxDocument(["<p>hello</p>"]);
  assert.ok(document.includes(GUARD), `guard missing from:\n${document}`);
});

check("the guard comes before anything the sender wrote", () => {
  // A policy that arrives after the body is a policy the browser may already
  // have applied scripts past.
  const document = sandboxDocument(["<script>alert(1)</script>"]);
  assert.ok(document.indexOf(GUARD) < document.indexOf("<script"), "the guard went after the content");
  assert.ok(document.startsWith("<!doctype html>"), "the document must start as a document");
});

check("the parts the API returns are joined into one document", () => {
  assert.equal(sandboxDocument(["one", "two", "three"]).split("\n").slice(1).join("\n"), "one\ntwo\nthree");
  assert.equal(sandboxDocument([]).split("\n").slice(1).join("\n"), "");
});

check("the sender's markup is passed through untouched", () => {
  // The point is not to rewrite the HTML — it is to load it under a policy that
  // makes it inert. Rewriting would be a second renderer to get wrong.
  const body = '<a href="https://x.test/c?a=1&b=2" onclick="steal()">go</a>';
  assert.ok(sandboxDocument([body]).includes(body), "the markup was altered");
});

check("a charset is declared, so a foreign-language mail is not mojibake", () => {
  assert.ok(sandboxDocument(["<p>привет</p>"]).includes('<meta charset="utf-8">'));
});

console.log(`${checks} checks passed`);
