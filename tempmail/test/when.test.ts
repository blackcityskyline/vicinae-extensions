import assert from "node:assert/strict";

import { absoluteTime, relativeTime, remainingTime, validUsername } from "../src/utils/when.ts";

// Pinned so the exact-string assertions mean the same thing on every machine.
// Without this they would only pass in the zone they were written in.
process.env.TZ = "UTC";

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

const AT = Date.parse("2026-03-10T04:59:12Z");

function ago(seconds: number): Date {
  return new Date(AT - seconds * 1000);
}

check("relative time reads in the order a person would say it", () => {
  assert.equal(relativeTime(ago(5), AT), "just now");
  assert.equal(relativeTime(ago(59), AT), "just now");
  assert.equal(relativeTime(ago(60), AT), "1m ago");
  assert.equal(relativeTime(ago(3 * 60), AT), "3m ago");
  assert.equal(relativeTime(ago(59 * 60), AT), "59m ago");
  assert.equal(relativeTime(ago(60 * 60), AT), "1h ago");
  assert.equal(relativeTime(ago(5 * 3600), AT), "5h ago");
  assert.equal(relativeTime(ago(23 * 3600), AT), "23h ago");
  assert.equal(relativeTime(ago(24 * 3600), AT), "1d ago");
  assert.equal(relativeTime(ago(9 * 86400), AT), "9d ago");
});

check("a message from the future does not say minus anything", () => {
  // Clock skew between the server and this machine is normal, and "in 3m"
  // is a worse thing to read than "just now".
  assert.equal(relativeTime(new Date(AT + 3 * 60_000), AT), "just now");
  assert.equal(relativeTime(ago(30), AT + 5_000), "just now");
});

check("relative time does not depend on the machine's locale or zone", () => {
  // The upstream uses moment().humanize(), which localises; this is fixed text.
  const rendered = relativeTime(ago(3600), AT);
  assert.equal(rendered, "1h ago");
  assert.ok(!/hour|hora|stunde/i.test(rendered), `"${rendered}" came from ICU`);
});

check("absolute time is built from parts and is 24-hour", () => {
  const rendered = absoluteTime(AT);
  assert.match(rendered, /^10\.03\.2026 04:59$/);
  // Never "3/10/2026, 4:59:12 AM": month first and a twelve-hour clock.
  assert.ok(!/AM|PM/i.test(rendered));
});

check("absolute time is local, and follows the machine's zone", () => {
  const at = Date.parse("2026-03-10T04:59:12Z");
  process.env.TZ = "Europe/Moscow";
  const moscow = absoluteTime(at);
  process.env.TZ = "America/New_York";
  const newYork = absoluteTime(at);
  process.env.TZ = "UTC";

  assert.equal(moscow, "10.03.2026 07:59", "UTC+3 all year");
  // New York is on daylight saving by 10 March 2026 — it started on the 8th — so
  // this is UTC-4 and lands after midnight. Getting this wrong is the kind of
  // thing a hardcoded offset does.
  assert.equal(newYork, "10.03.2026 00:59");
});

check("absolute time survives the awkward parts of a month", () => {
  assert.match(absoluteTime(Date.parse("2026-01-01T00:00:00Z")), /^\d\d\.01\.2026 00:00$/);
  assert.match(absoluteTime(Date.parse("2026-12-31T23:59:00Z")), /^\d\d\.12\.2026 23:59$/);
  assert.match(absoluteTime(Date.parse("2026-02-28T12:00:00Z")), /^\d\d\.02\.2026 12:00$/);
});

check("remaining time counts down and never goes negative", () => {
  assert.equal(remainingTime(AT + 10 * 60_000, AT), "10m");
  assert.equal(remainingTime(AT + 3600_000, AT), "1h");
  assert.equal(remainingTime(AT + 90 * 60_000, AT), "1h 30m");
  // The server's retention date can already be behind us; that is not an error.
  assert.equal(remainingTime(AT - 60_000, AT), "0m");
});

check("usernames are checked the way the form reports them", () => {
  assert.equal(validUsername(""), "Enter a username");
  assert.equal(validUsername("   "), "Enter a username");
  assert.equal(validUsername("has space"), "A username cannot contain spaces");
  assert.equal(validUsername("ok-name_42"), null);
  // @ would make the address ambiguous: local@domain.
  assert.equal(validUsername("a@b"), "A username cannot contain @");
});
