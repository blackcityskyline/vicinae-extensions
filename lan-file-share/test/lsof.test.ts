import assert from "node:assert/strict";
import { parseLsofOwners } from "../src/utils/lsof.ts";

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

// Captured from `lsof -nP -iTCP:7999 -sTCP:LISTEN -F pcu` on Linux 6.18 with a node
// process listening on 127.0.0.1:7999. `u` is the numeric uid, not a user name.
const REAL_SINGLE_LISTENER = "p669\ncnode\nu0\n";

check("parses the real lsof field output of one listener", () => {
  assert.deepEqual(parseLsofOwners(REAL_SINGLE_LISTENER), [{ pid: 669, command: "node", user: "0" }]);
});

// lsof -F repeats the same p/c/u block per process, so two listeners are two blocks.
check("parses one block per process, in order", () => {
  assert.deepEqual(parseLsofOwners("p10\ncsshd\nu0\np2210\ncpython3\nu1000\n"), [
    { pid: 10, command: "sshd", user: "0" },
    { pid: 2210, command: "python3", user: "1000" },
  ]);
});

// A free port gives empty output and exit code 1 (measured), which the caller treats as no owner.
check("returns no owners for empty output", () => {
  assert.deepEqual(parseLsofOwners(""), []);
});

check("falls back to unknown when the command or user field is missing", () => {
  assert.deepEqual(parseLsofOwners("p42\n"), [{ pid: 42, command: "unknown", user: "unknown" }]);
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
