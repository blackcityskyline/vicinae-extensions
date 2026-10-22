import assert from "node:assert/strict";

import {
  buildIcons,
  copyName,
  createLucideIcon,
  filterIcons,
  toKebabCase,
  toPascalCase,
} from "../src/icons.ts";

let passed = 0;
let failed = 0;
const checks: Array<[string, () => void]> = [];

function check(name: string, body: () => void): void {
  checks.push([name, body]);
}

const NODES = {
  "alarm-clock": [
    ["circle", { cx: "12", cy: "13", r: "8" }],
    ["path", { d: "M12 9v4l2 2" }],
  ] as [string, Record<string, string>][],
  "arrow-up-0-1": [["path", { d: "M3 3v18h18" }]] as [string, Record<string, string>][],
};

const ICONS = buildIcons(NODES, { "alarm-clock": ["time", "clock"], "arrow-up-0-1": ["sort"] }, { "alarm-clock": ["time"] });

check("an element is written with its attributes and children", () => {
  assert.equal(createLucideIcon("path", { d: "M0 0" }), '<path d="M0 0"></path>');
  assert.equal(
    createLucideIcon("svg", { viewBox: "0 0 24 24" }, ["<path d=\"M0 0\"></path>"]),
    '<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>',
  );
});

check("a catalogue entry carries the drawing, the URL and deduplicated keywords", () => {
  assert.equal(ICONS.length, 2);
  const alarm = ICONS.find((icon) => icon.name === "alarm-clock");
  assert.ok(alarm);
  assert.match(alarm.content, /^<svg xmlns=/);
  assert.match(alarm.content, /class="lucide lucide-alarm-clock"/);
  assert.match(alarm.content, /<circle cx="12" cy="13" r="8"><\/circle>/);
  assert.equal(alarm.path, "https://lucide.dev/api/icons/alarm-clock");
  assert.deepEqual(alarm.keywords, ["time", "clock"]);
});

check("names convert the way the icon set spells them", () => {
  assert.equal(toPascalCase("alarm-clock"), "AlarmClock");
  assert.equal(toPascalCase("arrow-up-0-1"), "ArrowUp01");
  assert.equal(toPascalCase("Moon"), "Moon");
  assert.equal(toKebabCase("AlarmClock"), "alarm-clock");
  assert.equal(copyName("alarm-clock", false), "alarm-clock");
  assert.equal(copyName("alarm-clock", true), "AlarmClock");
});

check("a search matches the name or a keyword, and its case does not matter", () => {
  assert.deepEqual(filterIcons(ICONS, "").map((icon) => icon.name), ["alarm-clock", "arrow-up-0-1"]);
  assert.deepEqual(filterIcons(ICONS, "alarm").map((icon) => icon.name), ["alarm-clock"]);
  assert.deepEqual(filterIcons(ICONS, "TIME").map((icon) => icon.name), ["alarm-clock"]);
  assert.deepEqual(filterIcons(ICONS, "sort").map((icon) => icon.name), ["arrow-up-0-1"]);
  assert.deepEqual(filterIcons(ICONS, "nothing"), []);
});

(async () => {
  for (const [name, body] of checks) {
    try {
      body();
      passed += 1;
      console.log(`ok   ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${name}`);
      console.log(`     ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${failed > 0 ? `${passed} passed, ${failed} failed` : `all ${passed} checks passed`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
