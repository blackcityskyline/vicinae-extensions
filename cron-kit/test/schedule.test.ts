import assert from "node:assert/strict";

import { describeSchedule } from "../src/utils/schedule.ts";

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

function described(expression: string) {
  const result = describeSchedule(expression);
  if (!result.ok) throw new Error(`${expression}: ${result.message}`);
  return result;
}

check("a plain expression is described in English", () => {
  assert.equal(described("0 9 * * 1-5").text, "At 09:00 AM, Monday through Friday");
});

check("a step is described as a step, not as a list", () => {
  assert.equal(described("*/15 * * * *").text, "Every 15 minutes");
});

check("the aliases crontab accepts are described", () => {
  assert.equal(described("@daily").text, "At 12:00 AM");
  assert.equal(described("@hourly").text, "Every hour");
  assert.equal(described("@reboot").text, "Run once, at startup");
});

// cron-parser knows @daily but not @midnight, @annually or @weekly, all three of
// which crontab accepts. They are the same schedules, so they get the same
// treatment before the parser ever sees them.

check("@midnight, @annually and @weekly still get a next run", () => {
  for (const alias of ["@midnight", "@annually", "@weekly"]) {
    assert.equal(described(alias).nextRuns.length, 3, `${alias} should have three next runs`);
  }
});

check("next runs are in the future and strictly increasing", () => {
  const times = described("*/5 * * * *").nextRuns.map((run) => run.getTime());
  assert.equal(times.length, 3);
  for (const [index, time] of times.entries()) {
    assert.ok(time > Date.now(), `run ${index} is in the past`);
    if (index > 0) assert.ok(time > (times[index - 1] ?? 0), `run ${index} is out of order`);
  }
});

check("@reboot has no next run and says so rather than inventing one", () => {
  assert.deepEqual(described("@reboot").nextRuns, []);
});

check("surrounding whitespace is not a syntax error", () => {
  assert.equal(describeSchedule("  */5 * * * *  ").ok, true);
});

// cronstrue is more permissive than crontab in one spot, and both reject a
// short field list. This only has to not describe nonsense as valid: the write
// path hands the expression to crontab, which is the authority.

check("empty and malformed expressions are rejected with a usable message", () => {
  const bad = ["", "   ", "nonsense", "* * * *", "* *", "61 * * * *", "0 25 * * *", "0 0 32 * *", "0 0 * 13 *", "0 0 * * 9"];
  for (const expression of bad) {
    const result = describeSchedule(expression);
    assert.equal(result.ok, false, `${JSON.stringify(expression)} should be rejected`);
    assert.ok(
      !result.ok && result.message.includes("cron expression"),
      `${JSON.stringify(expression)} message should say what is wrong`,
    );
  }
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
