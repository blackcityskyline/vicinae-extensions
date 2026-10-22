import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCACertificates } from "node:tls";

import {
  buildBody,
  createPaste,
  DpasteError,
  failureMessage,
  linkFrom,
  networkMessage,
  type FetchLike,
} from "../src/api.ts";
import { SYNTAXES } from "../src/syntaxes.ts";

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}

/** The identifiers are dpaste's, so the list is checked against the source when reachable. */
async function liveSyntaxCheck(): Promise<void> {
  const name = "every syntax identifier exists in dpaste's published list";
  let choices: Record<string, string>;

  try {
    const response = await fetch("https://dpaste.com/api/syntax-choices", { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    choices = (await response.json()) as Record<string, string>;
  } catch (error) {
    skip(name, (error as Error).message);
    return;
  }

  const unknown = SYNTAXES.filter((syntax) => !(syntax.id in choices));
  if (unknown.length > 0) {
    failed++;
    console.log(`FAIL ${name}: not in dpaste's list: ${unknown.map((syntax) => syntax.id).join(", ")}`);
    return;
  }

  passed++;
  console.log(`ok   ${name}`);
}

async function main(): Promise<void> {
  await check("the body carries the content and the expiry", () => {
    const body = buildBody({ content: "a&b\nc", expiryDays: 7 });
    assert.equal(body.get("content"), "a&b\nc");
    assert.equal(body.get("expiry_days"), "7");
    assert.equal(body.toString(), "content=a%26b%0Ac&expiry_days=7");
  });

  await check("blank title and syntax are omitted, not sent empty", () => {
    const body = buildBody({ content: "x", title: "  ", syntax: "", expiryDays: 1 });
    assert.equal(body.has("title"), false);
    assert.equal(body.has("syntax"), false);
  });

  await check("a title is trimmed, a syntax is passed as its identifier", () => {
    const body = buildBody({ content: "x", title: " Log ", syntax: "python", expiryDays: 1 });
    assert.equal(body.get("title"), "Log");
    assert.equal(body.get("syntax"), "python");
  });

  await check("the link comes from Location before the body", () => {
    assert.equal(linkFrom("https://dpaste.com/ABCD23456", "https://dpaste.com/OTHER"), "https://dpaste.com/ABCD23456");
  });

  await check("the body is the fallback, and newlines are trimmed", () => {
    assert.equal(linkFrom(null, " https://dpaste.com/ABCD23456\n"), "https://dpaste.com/ABCD23456");
  });

  await check("a missing or non-https link is an error, not a paste URL", () => {
    assert.throws(() => linkFrom(null, "<html>oops</html>"), DpasteError);
    assert.throws(() => linkFrom("http://dpaste.com/ABCD23456", ""), DpasteError);
    assert.throws(() => linkFrom("https://dpaste.com/", ""), DpasteError);
  });

  await check("the rate limit says what to do", () => {
    const message = failureMessage(429);
    assert.match(message, /one paste per second/);
    assert.match(message, /try again/i);
  });

  await check("a 400 names the fields, a 5xx says to retry later", () => {
    assert.match(failureMessage(400), /title, syntax and expiry/);
    assert.match(failureMessage(503), /HTTP 503/);
    assert.match(failureMessage(503), /later/);
  });

  await check("createPaste posts a form body and returns the Location", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const send: FetchLike = async (url, init) => {
      seen = { url, init };
      return new Response("https://dpaste.com/BODY2345", {
        status: 201,
        headers: { location: "https://dpaste.com/ABCD23456" },
      });
    };

    const url = await createPaste({ content: "hello", title: "t", syntax: "text", expiryDays: 1 }, send);

    assert.equal(url, "https://dpaste.com/ABCD23456");
    assert.equal(seen?.url, "https://dpaste.com/api/v2/");
    assert.equal(seen?.init.method, "POST");
    assert.equal((seen?.init.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal((seen?.init.headers as Record<string, string>)["User-Agent"], "vicinae-dpaste");
    assert.equal(String(seen?.init.body), "content=hello&expiry_days=1&title=t&syntax=text");
  });

  await check("createPaste falls back to the body when Location is absent", async () => {
    const send: FetchLike = async () => new Response("https://dpaste.com/ONLYBODY\n", { status: 201 });
    assert.equal(await createPaste({ content: "x", expiryDays: 1 }, send), "https://dpaste.com/ONLYBODY");
  });

  await check("a non-201 becomes the message for its status", async () => {
    const send: FetchLike = async () => new Response("", { status: 429 });
    await assert.rejects(createPaste({ content: "x", expiryDays: 1 }, send), /one paste per second/);
  });

  await check("an unreachable host is reported as such", async () => {
    const send: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    await assert.rejects(createPaste({ content: "x", expiryDays: 1 }, send), /Could not reach dpaste\.com.*ENOTFOUND/);
  });

  await check("a TLS failure names the CA store, since fetch only says fetch failed", () => {
    const error = new TypeError("fetch failed");
    (error as { cause?: unknown }).cause = new Error("unable to get local issuer certificate");

    const message = networkMessage(error);
    assert.match(message, /unable to get local issuer certificate/);
    assert.match(message, /CA store/);
  });

  await check("a plain network failure keeps its own detail", () => {
    const message = networkMessage(new Error("getaddrinfo ENOTFOUND dpaste.com"));
    assert.match(message, /ENOTFOUND/);
    assert.equal(message.includes("CA store"), false);
  });

  const root = readFileSync(join(__dirname, "..", "assets", "isrg-root-yr.crt"), "utf8");

  await check("the bundled root is Let's Encrypt Root YR, not some other file", () => {
    const certificate = new X509Certificate(root);
    assert.match(certificate.subject, /ISRG/);
    assert.match(certificate.subject, /Root YR/);
    assert.ok(certificate.validToDate.getTime() > Date.now(), "the bundled root has expired");
  });

  await check("importing the API trusts that root for this process", () => {
    assert.ok(getCACertificates("default").includes(root));
  });

  await check("every syntax has a non-empty identifier and label", () => {
    const ids = new Set<string>();
    for (const syntax of SYNTAXES) {
      assert.ok(syntax.id.length > 0, `empty id for ${syntax.title}`);
      assert.ok(syntax.title.length > 0, `empty title for ${syntax.id}`);
      assert.equal(ids.has(syntax.id), false, `duplicate id ${syntax.id}`);
      ids.add(syntax.id);
    }
  });

  await liveSyntaxCheck();

  console.log(
    failed === 0 ? `\n${passed} passed, ${skipped} skipped` : `\n${failed} check(s) failed, ${skipped} skipped`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
