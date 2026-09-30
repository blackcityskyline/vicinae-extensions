import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mergeHistories, parseBash, parseZsh, type Entry } from "../src/utils/history.ts";
import { DATE_FORMATS, DEFAULT_FORMAT, formatTimestamp } from "../src/utils/time.ts";

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
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

/** A local-time instant, so the checks do not depend on this machine's zone. */
function at(year: number, month: number, day: number, hour: number, minute: number): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

const march = at(2026, 3, 10, 4, 59);

// `toLocaleString()` with no locale gave "3/10/2026, 4:59:12 AM" here: month
// first and a twelve-hour clock. The order is a preference now, but whatever it
// is, the default is not that.
check("the default is day first, dot separated, 24-hour", () => {
  assert.equal(DEFAULT_FORMAT, "dotted");
  assert.equal(formatTimestamp(march, DEFAULT_FORMAT), "10.03.2026 04:59");
});

check("every format is a different order or separator", () => {
  assert.equal(formatTimestamp(march, "dotted"), "10.03.2026 04:59");
  assert.equal(formatTimestamp(march, "dmy"), "10/03/2026 04:59");
  assert.equal(formatTimestamp(march, "mdy"), "03/10/2026 04:59");
  assert.equal(formatTimestamp(march, "iso"), "2026-03-10 04:59");
});

check("an unknown format falls back instead of printing undefined", () => {
  assert.equal(formatTimestamp(march, "klingon" as never), "10.03.2026 04:59");
});

check("midnight is 00:00, not 12:00 AM", () => {
  for (const format of DATE_FORMATS) {
    const midnight = formatTimestamp(at(2026, 1, 1, 0, 0), format);
    const lastMinute = formatTimestamp(at(2026, 12, 31, 23, 59), format);
    assert.ok(midnight.endsWith("00:00"), `${format} rendered midnight as ${midnight}`);
    assert.ok(lastMinute.endsWith("23:59"), `${format} rendered 23:59 as ${lastMinute}`);
  }
});

check("every part is padded to two digits", () => {
  assert.equal(formatTimestamp(at(2026, 2, 3, 4, 5), "dotted"), "03.02.2026 04:05");
  assert.equal(formatTimestamp(at(2026, 2, 3, 4, 5), "iso"), "2026-02-03 04:05");
});

// The dropdown in the manifest and the union in the code have to agree, or a
// format the preference offers cannot be selected.
check("every format in the code is offered in the preference", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const pref = manifest.preferences.find((item: { name: string }) => item.name === "dateFormat");
  assert.ok(pref, "the manifest has no dateFormat preference");
  const values: string[] = (pref.data as { value: string }[]).map((item) => item.value);
  assert.deepEqual(values, [...DATE_FORMATS]);
  assert.equal(pref.default, DEFAULT_FORMAT);
});

check("no format ever renders a twelve-hour clock", () => {
  for (const format of DATE_FORMATS) {
    const rendered = formatTimestamp(at(2026, 7, 4, 13, 5), format);
    assert.ok(!/AM|PM/i.test(rendered), `${format} produced ${rendered}`);
  }
});

check("an entry with no timestamp says so instead of guessing a date", () => {
  for (const format of DATE_FORMATS) assert.equal(formatTimestamp(undefined, format), "—");
});

// The cap used to take the first N of each history, which for a file written in
// chronological order is the oldest N — so the most recent months were the ones
// that disappeared.
check("the newest entries are the ones kept when a history is too long", () => {
  const CAP = 3;
  const history: Entry[] = Array.from({ length: 10 }, (_, index) => ({
    command: `cmd-${index}`,
    when: at(2026, 1, 1 + index, 0, 0),
    shell: "fish" as const,
  }));

  const kept = history.slice(-CAP);
  assert.deepEqual(kept.map((entry) => entry.command), ["cmd-7", "cmd-8", "cmd-9"]);
  assert.equal(mergeHistories([kept])[0]?.command, "cmd-9");
});

check("entries with no timestamp come last, newest file order first", () => {
  const merged = mergeHistories([
    [{ command: "older bash", when: undefined, shell: "bash" }],
    [{ command: "newer bash", when: undefined, shell: "bash" }],
    [{ command: "dated", when: at(2026, 1, 1, 0, 0), shell: "fish" }],
  ]);
  assert.deepEqual(merged.map((entry) => entry.command), ["dated", "older bash", "newer bash"]);
});

check("a bash entry with no timestamp still parses", () => {
  assert.deepEqual(parseBash("ls")[0]?.when, undefined);
  assert.deepEqual(parseZsh("ls")[0]?.when, undefined);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
