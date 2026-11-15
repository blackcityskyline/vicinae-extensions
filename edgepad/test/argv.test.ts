import assert from "node:assert/strict";

import { formatArgv, parseArgv } from "../src/lib/argv.ts";

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

check("splits on whitespace", () => {
  assert.deepEqual(parseArgv("wpctl  set-volume   @DEFAULT_SINK@ 1%+"), ["wpctl", "set-volume", "@DEFAULT_SINK@", "1%+"]);
});

check("quotes group words and are removed", () => {
  assert.deepEqual(parseArgv('notify-send "edgepad" "hello world"'), ["notify-send", "edgepad", "hello world"]);
  assert.deepEqual(parseArgv("sh -c 'echo hi'"), ["sh", "-c", "echo hi"]);
});

check("backslash escapes the next character outside quotes", () => {
  assert.deepEqual(parseArgv("a\\ b c"), ["a b", "c"]);
  assert.deepEqual(parseArgv('sh -c "echo \\"hi\\""'), ["sh", "-c", 'echo "hi"']);
});

check("an empty quoted word is kept as an empty argument", () => {
  assert.deepEqual(parseArgv('program ""'), ["program", ""]);
});

check("empty input is no command", () => {
  assert.deepEqual(parseArgv("   "), []);
});

check("an unterminated quote is an error, not a silent split", () => {
  assert.throws(() => parseArgv('notify-send "oops'), /Unterminated double quote/);
  assert.throws(() => parseArgv("sh -c 'oops"), /Unterminated single quote/);
});

check("formatArgv round-trips through parseArgv", () => {
  const argv = ["sh", "-c", 'echo "hi" \\ bye', "", "plain"];
  assert.deepEqual(parseArgv(formatArgv(argv)), argv);
});

check("formatArgv leaves simple words alone", () => {
  assert.equal(formatArgv(["wpctl", "set-volume", "@DEFAULT_SINK@", "1%+"]), "wpctl set-volume @DEFAULT_SINK@ 1%+");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
