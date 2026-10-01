import assert from "node:assert/strict";

import { absoluteTime, relativeTime, remainingTime, validUsername } from "../src/utils/when.ts";

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

// Pinned so the exact-string assertions mean the same thing on any machine.
process.env.TZ = "UTC";

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
});

check("a timestamp from the future does not say minus anything", () => {
  // Last.fm's clock and this machine's do not have to agree.
  assert.equal(relativeTime(new Date(AT + 3 * 60_000), AT), "just now");
});

check("relative time does not come from ICU", () => {
  const rendered = relativeTime(ago(3600), AT);
  assert.equal(rendered, "1h ago");
  assert.ok(!/hour|stunde|hora/i.test(rendered), `"${rendered}" came from a locale`);
});

check("absolute time is built from parts and is 24-hour", () => {
  assert.equal(absoluteTime(AT), "10.03.2026 04:59");
  assert.ok(!/AM|PM/i.test(absoluteTime(AT)));
});

check("absolute time is local, and follows the machine's zone", () => {
  process.env.TZ = "Europe/Moscow";
  assert.equal(absoluteTime(AT), "10.03.2026 07:59", "UTC+3 all year");
  // New York is on daylight saving by 10 March 2026; it started on the 8th.
  process.env.TZ = "America/New_York";
  assert.equal(absoluteTime(AT), "10.03.2026 00:59");
  process.env.TZ = "UTC";
});

check("remaining time counts down and never goes negative", () => {
  assert.equal(remainingTime(AT + 10 * 60_000, AT), "10m");
  assert.equal(remainingTime(AT + 3600_000, AT), "1h");
  assert.equal(remainingTime(AT + 90 * 60_000, AT), "1h 30m");
  assert.equal(remainingTime(AT - 60_000, AT), "0m");
});

check("a username is checked the way the form would report it", () => {
  assert.equal(validUsername(""), "Enter a username");
  assert.equal(validUsername("   "), "Enter a username");
  assert.equal(validUsername("has space"), "A username cannot contain spaces");
  assert.equal(validUsername("koyaanis"), null);
});

console.log(`\nall ${checks} checks passed`);
