import assert from "node:assert/strict";

import {
  DankSessionError,
  formatAge,
  parseCapture,
  parseRestorePlan,
  parseStatus,
  restoreLabel,
  restoreSummary,
} from "../src/utils/state.ts";

/**
 * Fixtures are verbatim output of danksession v0.3.6 (`dev-7cd651479853`)
 * against a Hyprland 0.56.2 session with DANKSESSION_STATE/DANKSESSION_CONFIG
 * pointed at a temporary directory.
 */
const STATUS = `{"autoCapture":true,"captureIntervalSeconds":15,"saved":true,"savedAt":"2026-11-15T14:33:52.012550381Z","windows":3,"managed":0,"workspaces":3,"autoRestore":false,"daemonRunning":false,"statePath":"/tmp/opencode/ds/last.json","savedWindows":[{"application":"ai.opencode.desktop","workspace":{"id":1,"name":"1"},"width":1354,"height":756,"restore":"placement"},{"application":"zen","workspace":{"id":2,"name":"2"},"width":1354,"height":756,"restore":"placement"},{"application":"mpv","workspace":{"id":3,"name":"3"},"width":1366,"height":768,"restore":"placement"}]}`;

const UNSAVED = `{"autoCapture":true,"captureIntervalSeconds":15,"saved":false,"savedAt":"0001-01-01T00:00:00Z","windows":0,"managed":0,"workspaces":0,"autoRestore":false,"daemonRunning":false,"statePath":"/tmp/opencode/ds/last.json","savedWindows":[]}`;

const DRY_RUN = `{"dryRun":true,"matched":3,"missing":0,"launched":0,"operations":[{"kind":"geometry","slot":"mpv#1","detail":"1366x768 at 0,0"},{"kind":"workspace-monitor","detail":"1 -> LVDS-1"},{"kind":"workspace-monitor","detail":"2 -> LVDS-1"},{"kind":"workspace-monitor","detail":"3 -> LVDS-1"},{"kind":"active-workspace","detail":"LVDS-1 -> 3"}]}`;

const CAPTURE = `{"saved":true,"savedAt":"2026-11-15T14:24:49.124161117Z","statePath":"/tmp/opencode/ds/last.json","windows":3}`;

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

check("status carries the saved window list", () => {
  const status = parseStatus(STATUS);
  assert.equal(status.saved, true);
  assert.equal(status.windows, 3);
  assert.equal(status.workspaces, 3);
  assert.equal(status.daemonRunning, false);
  assert.equal(status.statePath, "/tmp/opencode/ds/last.json");
  assert.deepEqual(
    status.savedWindows.map((window) => [window.application, window.workspace.name, window.width, window.height, window.restore]),
    [
      ["ai.opencode.desktop", "1", 1354, 756, "placement"],
      ["zen", "2", 1354, 756, "placement"],
      ["mpv", "3", 1366, 768, "placement"],
    ],
  );
});

check("an unsaved state keeps its zero timestamp and empty list", () => {
  const status = parseStatus(UNSAVED);
  assert.equal(status.saved, false);
  assert.equal(status.savedWindows.length, 0);
  assert.equal(formatAge(status.savedAt), "never");
});

check("formatAge reads the Go timestamps", () => {
  const saved = "2026-11-15T14:33:52.012550381Z";
  const at = (iso: string) => formatAge(saved, Date.parse(iso));
  assert.equal(at("2026-11-15T14:34:00Z"), "just now");
  assert.equal(at("2026-11-15T14:38:52Z"), "5 min ago");
  assert.equal(at("2026-11-15T16:33:52Z"), "2 h ago");
  assert.equal(at("2026-11-18T14:33:52Z"), "3 d ago");
});

check("the error object becomes the message", () => {
  assert.throws(
    () => parseStatus(`{"error":"open /tmp/opencode/ds/none.json: no such file or directory"}`),
    (error: unknown) =>
      error instanceof DankSessionError && error.message === "open /tmp/opencode/ds/none.json: no such file or directory",
  );
});

check("non-JSON output is named as such", () => {
  assert.throws(() => parseStatus(""), DankSessionError);
  assert.throws(() => parseCapture("danksession: fatal"), /not JSON/);
});

check("the dry run lists what it would do", () => {
  const plan = parseRestorePlan(DRY_RUN);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.matched, 3);
  assert.equal(plan.missing, 0);
  assert.equal(plan.operations[0]?.kind, "geometry");
  assert.equal(plan.operations[0]?.slot, "mpv#1");
  assert.equal(plan.operations[plan.operations.length - 1]?.detail, "LVDS-1 -> 3");
  assert.equal(restoreSummary(plan), "3 matched");
});

check("restoreSummary names missing and launched windows only when present", () => {
  assert.equal(restoreSummary({ dryRun: true, matched: 2, missing: 1, launched: 3, operations: [] }), "2 matched · 1 missing · 3 to launch");
});

check("capture returns the window count", () => {
  assert.equal(parseCapture(CAPTURE), 3);
});

check("restore labels match the backend vocabulary", () => {
  assert.equal(restoreLabel("placement"), "Placement only");
  assert.equal(restoreLabel("relaunch"), "Relaunch");
  assert.equal(restoreLabel("skipped"), "skipped");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
