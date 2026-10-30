import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deliver, type DeliveryIo } from "../src/utils/deliver.ts";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
  }
}

/** An io that records what was done, in order. */
function recorder(): { io: DeliveryIo; calls: string[] } {
  const calls: string[] = [];
  const io: DeliveryIo = {
    copy: async (text) => void calls.push(`copy:${text}`),
    paste: async (text) => void calls.push(`paste:${text}`),
    closeWindow: async () => void calls.push("close"),
    backToRoot: async () => void calls.push("root"),
  };
  return { io, calls };
}

async function main(): Promise<void> {
  await check("copy puts the result on the clipboard and leaves the form", async () => {
    const { io, calls } = recorder();
    await deliver("a%20b", "copy", io);
    assert.deepEqual(calls, ["copy:a%20b", "root"]);
  });

  // The order that only shows up when a human presses the key: pasting while the form
  // still holds focus sends the text into the form.
  await check("paste closes the window before it pastes", async () => {
    const { io, calls } = recorder();
    await deliver("a b", "paste", io);
    assert.deepEqual(calls, ["close", "paste:a b"]);
  });

  await check("a failing clipboard is not reported as a delivery", async () => {
    const { io } = recorder();
    io.copy = async () => {
      throw new Error("clipboard unavailable");
    };
    await assert.rejects(() => deliver("x", "copy", io), /clipboard unavailable/);
  });

  await check("both output modes exist in the manifest, and copy is the default", async () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as {
      preferences: { name: string; default: string; data: { value: string }[] }[];
    };
    const output = manifest.preferences.find((pref) => pref.name === "output");
    assert.ok(output, "the output preference is missing");
    assert.equal(output.default, "copy");
    assert.deepEqual(output.data.map((entry) => entry.value).sort(), ["copy", "paste"]);
  });

  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
