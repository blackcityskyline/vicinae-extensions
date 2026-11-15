import assert from "node:assert/strict";

import { explainFailure, serviceCommand } from "../src/lib/command.ts";
import { filterServices, formatBytes, parseUnitInfo } from "../src/lib/units.ts";
import {
  ServiceLoadStatus,
  ServiceStatus,
  ServiceSubStatus,
  type Service,
  type SystemdUnit,
} from "../src/types.ts";

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

function unit(overrides: Partial<Record<number, string>> = {}): SystemdUnit {
  const row = [
    "nginx.service",
    "A high performance web server",
    "loaded",
    "active",
    "running",
    "",
    "/org/freedesktop/systemd1/unit/nginx_2eservice",
    "",
    "",
  ];
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value ?? "";
  return row as SystemdUnit;
}

check("system actions go through plain systemctl under polkit", () => {
  assert.deepEqual(serviceCommand("restart", "nginx.service", "system", "polkit"), [
    "systemctl",
    "restart",
    "nginx.service",
  ]);
});

check("user actions always pass --user", () => {
  assert.deepEqual(serviceCommand("start", "mpd.service", "user", "polkit"), [
    "systemctl",
    "--user",
    "start",
    "mpd.service",
  ]);
});

check("pkexec wraps system actions only", () => {
  assert.deepEqual(serviceCommand("enable", "nginx.service", "system", "pkexec"), [
    "pkexec",
    "systemctl",
    "enable",
    "nginx.service",
  ]);
  // pkexec drops DBUS_SESSION_BUS_ADDRESS, so --user can never run under it.
  assert.deepEqual(serviceCommand("enable", "mpd.service", "user", "pkexec"), [
    "systemctl",
    "--user",
    "enable",
    "mpd.service",
  ]);
});

check("unit names stay one argv entry", () => {
  const argv = serviceCommand("start", "evil; rm -rf ~.service", "system", "pkexec");
  assert.equal(argv.length, 4);
  assert.equal(argv[3], "evil; rm -rf ~.service");
});

check("missing agent is explained with what to start", () => {
  const message = explainFailure("Failed to start nginx.service: Interactive authentication required.");
  assert.match(message, /Interactive authentication required/);
  assert.match(message, /polkit-gnome-authentication-agent-1 or hyprpolkitagent/);
});

check("pkexec's own refusal gets the same hint", () => {
  assert.match(
    explainFailure("Error executing command as another user: Not authorized"),
    /Polkit had no agent/,
  );
});

check("missing binary and missing unit each get their own hint", () => {
  assert.match(explainFailure("spawn pkexec ENOENT"), /pkexec comes with polkit/);
  assert.match(explainFailure("Unit nope.service could not be found."), /not loaded by this systemd manager/);
});

check("unknown failures pass through, empty failures fall back", () => {
  assert.equal(explainFailure("Job failed. See journal."), "Job failed. See journal.");
  assert.match(explainFailure("   "), /without printing a reason/);
});

check("parseUnitInfo maps states and keeps empty optional fields undefined", () => {
  const service = parseUnitInfo(unit(), "system");
  assert.ok(service);
  assert.equal(service.name, "nginx.service");
  assert.equal(service.status, ServiceStatus.ACTIVE);
  assert.equal(service.subStatus, ServiceSubStatus.RUNNING);
  assert.equal(service.loadStatus, ServiceLoadStatus.LOADED);
  assert.equal(service.following, undefined);
  assert.equal(service.jobType, undefined);
});

check("parseUnitInfo keeps unknown states unknown instead of guessing", () => {
  const service = parseUnitInfo(unit({ 3: "activating", 4: "start", 2: "masked" }), "user");
  assert.equal(service?.status, ServiceStatus.UNKNOWN);
  assert.equal(service?.subStatus, ServiceSubStatus.UNKNOWN);
  assert.equal(service?.loadStatus, ServiceLoadStatus.UNKNOWN);
  assert.equal(service?.type, "user");
});

check("non-service units are skipped", () => {
  assert.equal(parseUnitInfo(unit({ 0: "graphical.target" }), "system"), null);
});

const sample: Service[] = [
  { ...(parseUnitInfo(unit(), "system") as Service), icon: "" },
  { ...(parseUnitInfo(unit({ 0: "mpd.service", 3: "inactive", 4: "dead" }), "user") as Service), icon: "" },
];

check("filters split system, user, running and stopped", () => {
  assert.equal(filterServices(sample, "all").length, 2);
  assert.deepEqual(filterServices(sample, "system").map((s) => s.name), ["nginx.service"]);
  assert.deepEqual(filterServices(sample, "user").map((s) => s.name), ["mpd.service"]);
  assert.deepEqual(filterServices(sample, "running").map((s) => s.name), ["nginx.service"]);
  assert.deepEqual(filterServices(sample, "stopped").map((s) => s.name), ["mpd.service"]);
});

check("formatBytes scales and stops at the last unit", () => {
  assert.equal(formatBytes(512), "512.0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1024 ** 4), "1.0 TB");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
