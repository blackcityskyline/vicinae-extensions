import assert from "node:assert/strict";

import { emptyBlocklist, isBlocked, withoutHost, withoutUrl } from "../src/utils/blocklist.ts";
import { pickProfile } from "../src/utils/profile.ts";
import { hostOf, toUrl } from "../src/utils/url.ts";

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
// toUrl. The rules are upstream's README, verbatim: an input with a scheme is
// opened as is, local addresses get http, domains and IPs get https, and
// anything else becomes a Google search.
// ---------------------------------------------------------------------------

check("a scheme is passed through untouched", () => {
  assert.equal(toUrl("https://example.com/a?b=c#d"), "https://example.com/a?b=c#d");
  assert.equal(toUrl("http://example.com"), "http://example.com");
  assert.equal(toUrl("chrome://settings"), "chrome://settings");
  assert.equal(toUrl("about:blank"), "about:blank");
  assert.equal(toUrl("file:///tmp/a.html"), "file:///tmp/a.html");
  assert.equal(toUrl("mailto:someone@example.com"), "mailto:someone@example.com");
});

check("whitespace means a search", () => {
  assert.equal(toUrl("rust borrow checker"), "https://www.google.com/search?q=rust%20borrow%20checker");
  assert.equal(toUrl("  spaced  out  "), "https://www.google.com/search?q=spaced%20%20out");
});

check("single words and unknown TLDs become searches", () => {
  assert.equal(toUrl("git"), "https://www.google.com/search?q=git");
  assert.equal(toUrl("raycast"), "https://www.google.com/search?q=raycast");
});

check("local names get http", () => {
  assert.equal(toUrl("localhost"), "http://localhost");
  assert.equal(toUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(toUrl("localhost:3000/api?x=1"), "http://localhost:3000/api?x=1");
  assert.equal(toUrl("127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(toUrl("[::1]:9000"), "http://[::1]:9000");
  assert.equal(toUrl("app.localhost"), "http://app.localhost");
  assert.equal(toUrl("my-app.test/path"), "http://my-app.test/path");
});

check("domains and IPs get https", () => {
  assert.equal(toUrl("example.com"), "https://example.com");
  assert.equal(toUrl("example.com:8080/path"), "https://example.com:8080/path");
  assert.equal(toUrl("sub.example.co.uk/a?b=1"), "https://sub.example.co.uk/a?b=1");
  assert.equal(toUrl("192.168.1.1"), "https://192.168.1.1");
  assert.equal(toUrl("8.8.8.8:53/dns"), "https://8.8.8.8:53/dns");
});

check("an empty input stays empty rather than searching for nothing", () => {
  assert.equal(toUrl(""), "");
  assert.equal(toUrl("   "), "");
});

check("the host of a URL is its host, and nothing else", () => {
  assert.equal(hostOf("https://www.example.com/a"), "www.example.com");
  assert.equal(hostOf("https://example.com:8443/a"), "example.com:8443");
  assert.equal(hostOf("not a url"), undefined);
});

// ---------------------------------------------------------------------------
// isBlocked. A hidden site hides both schemes of that host; a hidden page hides
// exactly that URL; nothing else is affected.
// ---------------------------------------------------------------------------

check("a hidden page hides only itself", () => {
  const list = { urls: ["https://example.com/a"], hosts: [] };
  assert.equal(isBlocked("https://example.com/a", list), true);
  assert.equal(isBlocked("https://example.com/b", list), false);
  assert.equal(isBlocked("http://example.com/a", list), false);
});

check("a hidden site hides both schemes and every path", () => {
  const list = { urls: [], hosts: ["example.com"] };
  assert.equal(isBlocked("https://example.com/a", list), true);
  assert.equal(isBlocked("http://example.com", list), true);
  assert.equal(isBlocked("https://sub.example.com/a", list), false);
});

check("a non-http URL is never hidden by a site entry", () => {
  const list = { urls: [], hosts: ["example.com"] };
  assert.equal(isBlocked("mailto:someone@example.com", list), false);
  assert.equal(isBlocked("chrome://settings", list), false);
  assert.equal(isBlocked("not a url", list), false);
});

check("unhiding removes one entry and keeps the rest", () => {
  const list = { urls: ["https://a.example", "https://b.example"], hosts: ["c.example"] };
  assert.deepEqual(withoutUrl(list, "https://a.example"), { urls: ["https://b.example"], hosts: ["c.example"] });
  assert.deepEqual(withoutHost(list, "c.example"), { urls: ["https://a.example", "https://b.example"], hosts: [] });
  assert.deepEqual(emptyBlocklist(), { urls: [], hosts: [] });
});

// ---------------------------------------------------------------------------
// pickProfile. `last_used` is what upstream relied on; current Chromium builds
// no longer write it, so the fallbacks are load-bearing.
// ---------------------------------------------------------------------------

const profiles = [
  { name: "Default", historyMtimeMs: 100 },
  { name: "Profile 1", historyMtimeMs: 300 },
  { name: "Profile 2", historyMtimeMs: 200 },
];

check("last_used wins when it names a real profile", () => {
  assert.equal(pickProfile({ profile: { last_used: "Profile 2" } }, profiles), "Profile 2");
});

check("a stale last_used is ignored", () => {
  assert.equal(pickProfile({ profile: { last_used: "Deleted" } }, profiles), "Profile 1");
});

check("last_active_profiles is the fallback", () => {
  assert.equal(pickProfile({ profile: { last_active_profiles: ["Profile 2", "Default"] } }, profiles), "Profile 2");
});

check("the most recently written history is the last resort", () => {
  assert.equal(pickProfile({ profile: { info_cache: {} } }, profiles), "Profile 1");
});

check("nothing to go on means Default", () => {
  assert.equal(pickProfile(undefined, []), "Default");
  assert.equal(pickProfile("garbage", []), "Default");
  assert.equal(pickProfile({ profile: { last_active_profiles: "nope" } }, []), "Default");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
