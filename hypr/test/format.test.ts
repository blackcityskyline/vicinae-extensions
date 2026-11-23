import assert from "node:assert/strict";

import {
  capitalizeFirst,
  formatRefreshRate,
  formatResolution,
  formatWorkspace,
} from "../src/utils/format.ts";

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

check("capitalizeFirst", () => {
  assert.equal(capitalizeFirst("hypr"), "Hypr");
  assert.equal(capitalizeFirst(""), "");
});

check("formatResolution", () => {
  assert.equal(formatResolution(), "Unknown");
  assert.equal(formatResolution(1920), "Unknown");
  assert.equal(formatResolution(1920, 1080), "1920x1080");
});

check("formatRefreshRate", () => {
  assert.equal(formatRefreshRate(), "Unknown");
  assert.equal(formatRefreshRate(144), "144.00Hz");
  assert.equal(formatRefreshRate(60.5), "60.50Hz");
});

check("formatWorkspace", () => {
  assert.equal(formatWorkspace(1, "main"), "main");
  assert.equal(formatWorkspace(1, ""), "1");
});

console.log(`\n${checks} checks`);
