import assert from "node:assert/strict";
import { resolvePort } from "../src/utils/port.ts";
import { CONTROL_PORT, DEFAULT_PORT } from "../src/utils/types.ts";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

check("an empty or missing preference means the default port, without a complaint", () => {
  assert.deepEqual(resolvePort(undefined), { port: DEFAULT_PORT });
  assert.deepEqual(resolvePort(""), { port: DEFAULT_PORT });
  assert.deepEqual(resolvePort("   "), { port: DEFAULT_PORT });
});

check("a valid port is used, with surrounding spaces ignored", () => {
  assert.deepEqual(resolvePort("8080"), { port: 8080 });
  assert.deepEqual(resolvePort(" 9000 "), { port: 9000 });
});

check("1024 and 49151 are the inclusive limits", () => {
  assert.deepEqual(resolvePort("1024"), { port: 1024 });
  assert.deepEqual(resolvePort("49151"), { port: 49151 });
  assert.equal(resolvePort("1023").port, DEFAULT_PORT);
  assert.equal(resolvePort("49152").port, DEFAULT_PORT);
});

check("an unusable value falls back and says what was wrong", () => {
  for (const raw of ["abc", "73.5", "-1", "80", "70000"]) {
    const choice = resolvePort(raw);
    assert.equal(choice.port, DEFAULT_PORT, raw);
    assert.ok(choice.problem?.includes(`"${raw}"`), `${raw}: ${choice.problem}`);
  }
});

check("the control port is refused: the service already listens on it", () => {
  const choice = resolvePort(String(CONTROL_PORT));
  assert.equal(choice.port, DEFAULT_PORT);
  assert.ok(choice.problem?.includes(String(CONTROL_PORT)), `problem was: ${choice.problem ?? "missing"}`);
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
