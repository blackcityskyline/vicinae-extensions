import assert from "node:assert/strict";

import { parseDevices, parseDoctor, parseStatus } from "../src/lib/report.ts";

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

const STATUS = `edgepad status

Service  active (running), pid 197991
Config   /home/black/.config/edgepad/hypr-edgepad.toml
Device   /dev/input/event11 kind=touchpad name="ETPS/2 Elantech Touchpad" id=0002:000e slots=0..=4 x=0..=3249 y=0..=2223
Zones    left, right, top, bottom active; none passthrough; widths: left 4.0%, right 2.0%, top 6.0%, bottom 8.0%
Actions  16 gesture bindings, 2 sliders, 6 commands

Result   running
`;

const DOCTOR = `edgepad doctor

Config
  fail  path       not found: /home/black/.config/edgepad/edgepad.toml; pass --config <file> or create ~/.config/edgepad/edgepad.toml
  warn  device     using auto because config was not loaded

Device
  ok    touchpad   /dev/input/event11 kind=touchpad name="ETPS/2 Elantech Touchpad"
  ok    input      /dev/input/event11 can be opened by current user
  ok    uinput     /dev/uinput is readable and writable

Access
  warn  udev tags  missing seat/uaccess current tags; touchpad=["uaccess"] uinput=["seat", "uaccess"]
  warn  acl        missing rw ACL for user black; touchpad_acl=false uinput_acl=true

Summary
  ok=6 warn=3 fail=1
  result: problems found
`;

const DEVICES = `/dev/input/event11 kind=touchpad name="ETPS/2 Elantech Touchpad" id=0002:000e slots=0..=4 x=0..=3249 y=0..=2223
`;

check("status lines and result are split", () => {
  const report = parseStatus(STATUS);
  assert.equal(report.result, "running");
  assert.deepEqual(
    report.lines.map((line) => line.subject),
    ["Service", "Config", "Device", "Zones", "Actions"],
  );
  assert.equal(report.lines[1]?.detail, "/home/black/.config/edgepad/hypr-edgepad.toml");
});

check("a misconfigured status keeps the parse error as data", () => {
  const report = parseStatus(
    "edgepad status\n\nService  inactive (dead)\nConfig   failed to parse config bad.toml: gestures[0].zone must be one of: left, right, top, bottom, pad\n\nResult   misconfigured\n",
  );
  assert.equal(report.result, "misconfigured");
  assert.match(report.lines[1]?.detail ?? "", /must be one of/);
});

check("doctor sections, severities and summary are parsed", () => {
  const report = parseDoctor(DOCTOR);
  assert.deepEqual(
    report.sections.map((section) => section.title),
    ["Config", "Device", "Access"],
  );
  assert.deepEqual(report.sections[0]?.checks.map((check) => check.severity), ["fail", "warn"]);
  assert.equal(report.sections[2]?.checks[1]?.name, "acl");
  assert.deepEqual(report.summary, { ok: 6, warn: 3, fail: 1, result: "problems found" });
});

check("doctor without a summary still yields the checks", () => {
  const report = parseDoctor("edgepad doctor\n\nDevice\n  ok    touchpad   /dev/input/event11\n");
  assert.equal(report.summary, undefined);
  assert.equal(report.sections[0]?.checks[0]?.detail, "/dev/input/event11");
});

check("devices keep name and the remaining fields", () => {
  const devices = parseDevices(DEVICES);
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.path, "/dev/input/event11");
  assert.equal(devices[0]?.kind, "touchpad");
  assert.equal(devices[0]?.name, "ETPS/2 Elantech Touchpad");
  assert.match(devices[0]?.rest ?? "", /^id=0002:000e/);
});

check("empty command output is an empty report", () => {
  assert.deepEqual(parseDevices(""), []);
  assert.deepEqual(parseStatus("").lines, []);
  assert.deepEqual(parseDoctor("").sections, []);
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
