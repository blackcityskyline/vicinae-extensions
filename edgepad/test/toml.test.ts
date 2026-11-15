import assert from "node:assert/strict";

import {
  appendGesture,
  appendSlider,
  deleteGesture,
  deleteSlider,
  formatGesture,
  formatSlider,
  parseConfig,
  replaceGesture,
  replaceSlider,
  setSetting,
  validateGesture,
  validateSlider,
  type Gesture,
} from "../src/lib/toml.ts";

const FIXTURE = `# leading comment kept exactly as written
device = "auto"
edge_width = 0.10

# a comment that belongs to nobody
[[gestures]]
zone = "top"
direction = "left"
action = [
  "notify-send",
  "top-left",
]

[[gestures]]
zone = "pad"
direction = "tap"
fingers = 3
action = { log = true }

[[sliders]]
zone = "left"
step = 0.04
up = ["brightnessctl", "set", "1%+"]
down = ["brightnessctl", "set", "1%-"]

[[gestures]]
zone = "right"
direction = "tap"
action = ["vicinae", "toggle"]
`;

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

check("parses settings, multi-line arrays, inline tables and comments", () => {
  const doc = parseConfig(FIXTURE);
  assert.equal(doc.gestures.length, 3);
  assert.equal(doc.sliders.length, 1);
  assert.equal(doc.issues.length, 0);
  assert.equal(doc.settings.get("edge_width")?.value, 0.1);
  assert.deepEqual(doc.gestures[0]?.value.action, { kind: "command", argv: ["notify-send", "top-left"] });
  assert.deepEqual(doc.gestures[1]?.value, {
    zone: "pad",
    direction: "tap",
    fingers: 3,
    action: { kind: "log" },
  });
  assert.deepEqual(doc.sliders[0]?.value, {
    zone: "left",
    step: 0.04,
    up: ["brightnessctl", "set", "1%+"],
    down: ["brightnessctl", "set", "1%-"],
  });
});

check("reports bindings edgepad would reject instead of dropping them silently", () => {
  const doc = parseConfig('[[gestures]]\nzone = "middle"\ndirection = "tap"\naction = ["true"]\n');
  assert.equal(doc.gestures.length, 0);
  assert.equal(doc.issues.length, 1);
  assert.match(doc.issues[0] ?? "", /unknown zone/);
});

check("appending keeps every existing byte before the new block", () => {
  const next = appendGesture(FIXTURE, { zone: "bottom", direction: "right", action: { kind: "command", argv: ["true"] } });
  assert.ok(next.startsWith(FIXTURE));
  assert.equal(parseConfig(next).gestures.length, 4);
});

const replacement: Gesture = {
  zone: "top",
  direction: "left",
  action: { kind: "command", argv: ["wpctl", "set-volume", "@DEFAULT_SINK@", "1%+"] },
};

check("replacing touches only the edited block and keeps comments", () => {
  const next = replaceGesture(FIXTURE, 0, replacement);
  const doc = parseConfig(next);
  assert.equal(doc.gestures[0]?.value.zone, "top");
  assert.equal(doc.gestures[0]?.value.direction, "left");
  assert.deepEqual(doc.gestures[0]?.value.action, replacement.action);
  assert.ok(next.includes("# a comment that belongs to nobody"));
  assert.ok(next.includes("# leading comment kept exactly as written"));
  assert.ok(!next.includes('"top-left"'));
  assert.equal(doc.gestures.length, 3);
  assert.equal(doc.sliders.length, 1);
});

check("deleting removes the block and nothing else", () => {
  const next = deleteGesture(FIXTURE, 1);
  const doc = parseConfig(next);
  assert.equal(doc.gestures.length, 2);
  assert.ok(!next.includes("fingers = 3"));
  assert.ok(next.includes("# a comment that belongs to nobody"));
  assert.ok(next.includes('zone = "right"'));
});

check("slider append, replace and delete round-trip", () => {
  const slider = {
    zone: "top" as const,
    step: 0.05,
    left: ["playerctl", "previous"],
    right: ["playerctl", "next"],
  };
  const added = appendSlider(FIXTURE, slider);
  assert.deepEqual(parseConfig(added).sliders[1]?.value, slider);

  const replaced = replaceSlider(added, 1, { ...slider, step: 0.1 });
  assert.equal(parseConfig(replaced).sliders[1]?.value.step, 0.1);

  const removed = deleteSlider(replaced, 1);
  assert.equal(parseConfig(removed).sliders.length, 1);
  assert.ok(!removed.includes("playerctl"));
});

check("setSetting writes a missing key into the top-level block", () => {
  const next = setSetting(FIXTURE, "nice", -11);
  const doc = parseConfig(next);
  assert.equal(doc.settings.get("nice")?.value, -11);
  assert.equal(doc.gestures.length, 3);
  assert.ok(next.includes('device = "auto"'));
});

check("setSetting replaces a value in place and keeps the line's neighbours", () => {
  const next = setSetting(FIXTURE, "edge_width", 0.2);
  const doc = parseConfig(next);
  assert.equal(doc.settings.get("edge_width")?.value, 0.2);
  assert.equal(next.split("\n").length, FIXTURE.split("\n").length);
});

check("setSetting with undefined removes the key", () => {
  const next = setSetting(FIXTURE, "edge_width", undefined);
  assert.equal(parseConfig(next).settings.has("edge_width"), false);
});

check("CRLF files keep CRLF", () => {
  const crlf = FIXTURE.replace(/\n/g, "\r\n");
  const next = appendGesture(crlf, replacement);
  assert.ok(next.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(next));
});

check("validateGesture rejects duplicates, pad swipes and slider conflicts", () => {
  const doc = parseConfig(FIXTURE);
  assert.match(validateGesture(doc, { ...replacement, fingers: undefined }) ?? "", /already bound/);
  assert.equal(validateGesture(doc, replacement, 0), undefined);
  assert.match(
    validateGesture(doc, { zone: "pad", direction: "up", action: { kind: "command", argv: ["true"] } }) ?? "",
    /tap and double-tap/,
  );
  assert.match(
    validateGesture(doc, { zone: "left", direction: "up", action: { kind: "command", argv: ["true"] } }) ?? "",
    /conflicts with the left slider/,
  );
  assert.equal(
    validateGesture(doc, { zone: "left", direction: "tap", action: { kind: "command", argv: ["true"] } }),
    undefined,
  );
});

check("validateSlider rejects a duplicate edge and an occupied swipe edge", () => {
  const doc = parseConfig(FIXTURE);
  assert.match(validateSlider(doc, { zone: "left", step: 0.04, up: ["a"], down: ["b"] }) ?? "", /already has a slider/);
  assert.match(
    validateSlider(doc, { zone: "top", step: 0.04, left: ["a"], right: ["b"] }) ?? "",
    /cannot also swipe/,
  );
  assert.match(validateSlider(doc, { zone: "right", step: 0, up: ["a"], down: ["b"] }) ?? "", /Step/);
  assert.equal(validateSlider(doc, { zone: "right", step: 0.04, up: ["a"], down: ["b"] }), undefined);
});

check("formatGesture emits what edgepad's TOML expects", () => {
  assert.deepEqual(formatGesture(replacement), [
    "[[gestures]]",
    'zone = "top"',
    'direction = "left"',
    'action = ["wpctl", "set-volume", "@DEFAULT_SINK@", "1%+"]',
  ]);
  assert.ok(formatGesture({ zone: "pad", direction: "tap", action: { kind: "log" } }).includes("action = { log = true }"));
});

check("formatSlider writes only the axis the edge uses", () => {
  const lines = formatSlider({ zone: "bottom", step: 0.05, left: ["a"], right: ["b"] });
  assert.ok(lines.includes('left = ["a"]'));
  assert.ok(!lines.some((line) => line.startsWith("up =")));
});

check("quoting survives argv entries with spaces, quotes and backslashes", () => {
  const argv = ["sh", "-c", 'echo "hi" \\ done', ""];
  const text = appendGesture("", { zone: "right", direction: "tap", action: { kind: "command", argv } });
  assert.deepEqual(parseConfig(text).gestures[0]?.value.action, { kind: "command", argv });
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
