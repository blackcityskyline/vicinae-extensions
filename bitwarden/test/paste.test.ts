import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The launcher keeps focus while a view command runs, so a paste that does not
// close it first lands in its own search bar. Two files are allowed to call
// `Clipboard.paste` themselves: the helper that closes, and the no-view command.
const ALLOWED = new Set(["utils/clipboard.ts", "generate-password-quick.tsx"]);

// `npm test` runs from the extension directory.
const root = "src/";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

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

check("every paste closes the launcher first", () => {
  const offenders = sources(root)
    .filter((path) => !ALLOWED.has(path.slice(root.length)))
    .filter((path) => readFileSync(path, "utf8").includes("Clipboard.paste("))
    .map((path) => path.slice(root.length));
  assert.deepEqual(offenders, []);
});

check("the shared helper closes before it pastes", () => {
  const source = readFileSync(join(root, "utils/clipboard.ts"), "utf8");
  const close = source.indexOf("closeMainWindow()");
  const paste = source.indexOf("Clipboard.paste(");
  assert.ok(close > 0 && paste > close, "closeMainWindow must come before Clipboard.paste");
});

if (failures > 0) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
