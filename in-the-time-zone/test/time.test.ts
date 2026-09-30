import assert from "node:assert/strict";

import {
  formatDelta,
  formatGmtOffset,
  hourKind,
  offsetMinutes,
  zoneClock,
  zoneDay,
  dayShift,
} from "../src/utils/time.ts";

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

const AT = new Date("2026-04-08T18:39:00Z");

check("GMT offset renders whole hours without a minutes part", () => {
  assert.equal(formatGmtOffset(0), "GMT+0");
  assert.equal(formatGmtOffset(330), "GMT+5:30");
  assert.equal(formatGmtOffset(-420), "GMT-7");
  assert.equal(formatGmtOffset(-345), "GMT-5:45");
});

check("offsets that are not whole hours survive", () => {
  // Kathmandu is +5:45 and Chatham is +12:45; a formatter that assumes
  // 60-minute units drops the tail and lies about the zone.
  assert.equal(formatGmtOffset(345), "GMT+5:45");
  assert.equal(formatGmtOffset(765), "GMT+12:45");
  assert.equal(formatGmtOffset(-570), "GMT-9:30");
});

check("delta in clock style is signed and zero-padded", () => {
  assert.equal(formatDelta(0, "clock"), "same");
  assert.equal(formatDelta(570, "clock"), "+9:30");
  assert.equal(formatDelta(-570, "clock"), "-9:30");
  assert.equal(formatDelta(60, "clock"), "+1:00");
});

check("delta in text style pluralises hours only when it must", () => {
  assert.equal(formatDelta(60, "text"), "+1 hr");
  assert.equal(formatDelta(120, "text"), "+2 hrs");
  assert.equal(formatDelta(-570, "text"), "-9h 30m");
  assert.equal(formatDelta(-570), "-9h 30m", "text is the default style");
});

check("offsets come from the zone database, not from the host clock", () => {
  assert.equal(offsetMinutes("Asia/Kolkata", AT), 330);
  assert.equal(offsetMinutes("America/Los_Angeles", AT), -420);
  assert.equal(offsetMinutes("Etc/UTC", AT), 0);
  // 45-minute and 12:45 zones are where a hours-only implementation breaks.
  assert.equal(offsetMinutes("Asia/Kathmandu", AT), 345);
  assert.equal(offsetMinutes("Pacific/Chatham", AT), 765);
});

check("daylight saving is read at the instant, not cached per zone", () => {
  // London is UTC+0 in January and UTC+1 in April. A zone offset computed once
  // and reused puts every London row an hour out for half the year.
  assert.equal(offsetMinutes("Europe/London", new Date("2026-01-15T12:00:00Z")), 0);
  assert.equal(offsetMinutes("Europe/London", AT), 60);
  // Southern hemisphere runs the other way round.
  assert.equal(offsetMinutes("Australia/Adelaide", AT), 570);
  assert.equal(offsetMinutes("Australia/Adelaide", new Date("2026-07-15T12:00:00Z")), 570);
});

check("hour bands match the legend", () => {
  assert.equal(hourKind(0), "sleep");
  assert.equal(hourKind(6), "sleep");
  assert.equal(hourKind(7), "marginal");
  assert.equal(hourKind(8), "marginal");
  assert.equal(hourKind(9), "work");
  assert.equal(hourKind(16), "work");
  assert.equal(hourKind(17), "marginal");
  assert.equal(hourKind(23), "marginal");
});

check("the clock is 12-hour and never zero-padded", () => {
  // At this instant London is on BST, Kolkata has just crossed midnight and
  // San Francisco is still in the morning.
  assert.equal(zoneClock("Europe/London", AT), "7:39 PM");
  assert.equal(zoneClock("Asia/Kolkata", AT), "12:09 AM");
  // `hour: "numeric"` and not "2-digit": a zero-padded 9 renders as "09:39 AM"
  // and is one column wider than the others, so the colons stop lining up.
  assert.equal(zoneClock("America/Los_Angeles", AT), "11:39 AM");
  assert.equal(zoneClock("America/Los_Angeles", new Date("2026-04-09T01:39:00Z")), "6:39 PM");
});

check("dates are built from named parts, so the locale cannot reorder them", () => {
  assert.equal(zoneDay("Europe/London", AT), "Wed, Apr 8");
  assert.equal(zoneDay("Asia/Kolkata", AT), "Thu, Apr 9");
});

check("day shift is empty on the same date and signed otherwise", () => {
  assert.equal(dayShift("Europe/London", "Europe/London", AT), "");
  assert.equal(dayShift("Asia/Kolkata", "America/Los_Angeles", AT), " +1");
  assert.equal(dayShift("America/Los_Angeles", "Asia/Kolkata", AT), " -1");
  // A year apart is still one day apart in the sense that matters here.
  assert.equal(dayShift("Asia/Kolkata", "Pacific/Auckland", AT), "");
});
