import assert from "node:assert/strict";

import {
  armCommands,
  cancelCommand,
  classifyDisappearance,
  parseActiveStates,
  parseCapability,
  parseTimerUnits,
  unitStem,
} from "~/utils/systemd";

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

const PATHS = { systemctl: "/usr/bin/systemctl", notifySend: "/usr/bin/notify-send" };

const base = {
  id: 1_762_000_000,
  action: "poweroff" as const,
  secondsFromNow: 1800,
  dryRun: false,
};

check("the stem is prefixed, so a stray unit is recognisable and cancellable", () => {
  assert.equal(unitStem("action", base.id), "vicinae-shutdown-timer-1762000000");
  assert.equal(unitStem("early", base.id), "vicinae-shutdown-timer-1762000000-early");
  assert.match(unitStem("action", base.id), /^vicinae-shutdown-timer-/);
});

check("arming a power action runs systemctl with no shell in sight", () => {
  const plan = armCommands({ ...base, role: "action" }, PATHS);
  assert.ok(plan);
  const { binary, args, exec } = plan;
  assert.equal(binary, "systemd-run");
  assert.ok(!args.some((arg) => /[;&|`$]/.test(arg)), "a shell metacharacter reached argv");
  assert.deepEqual(exec, ["/usr/bin/systemctl", "poweroff"]);
  assert.ok(args.includes("--unit=vicinae-shutdown-timer-1762000000"));
  assert.ok(args.includes("--on-active=1800s"));
  // AccuracySec defaults to 1min of slack, which makes a countdown a lie.
  assert.ok(args.includes("--timer-property=AccuracySec=1s"));
  assert.ok(args.includes("--collect"), "a unit left behind after firing can never be cancelled");
});

check("a dry run replaces the power command with a notification", () => {
  const plan = armCommands({ ...base, role: "action", dryRun: true }, PATHS);
  assert.ok(plan);
  const { exec } = plan;
  assert.equal(exec[0], "/usr/bin/notify-send");
  assert.deepEqual(exec.slice(1, 3), ["-a", "Shutdown Timer"]);
  assert.ok(exec.some((part) => /dry run/i.test(part)), "the dry-run notice does not say so");
  assert.ok(!exec.some((part) => part.includes("poweroff") && part.startsWith("/")), "it still runs systemctl");
});

check("the warning timers fire before the action, not after", () => {
  const early = armCommands({ ...base, role: "early", earlySeconds: 300 }, PATHS);
  assert.ok(early);
  assert.ok(early.args.includes("--on-active=1500s"));
  assert.equal(early.exec[0], "/usr/bin/notify-send");

  const final = armCommands({ ...base, role: "final", finalSeconds: 30 }, PATHS);
  assert.ok(final);
  assert.ok(final.args.includes("--on-active=1770s"));
  assert.ok(final.exec.includes("critical"), "the last notice is not urgent");
});

check("a warning that would land after the action is not armed", () => {
  // 4 minutes ahead with a 5-minute early warning: the warning would fire in the past.
  assert.equal(armCommands({ ...base, role: "early", secondsFromNow: 240, earlySeconds: 300 }, PATHS), null);
  assert.equal(armCommands({ ...base, role: "final", secondsFromNow: 20, finalSeconds: 30 }, PATHS), null);
  // No preference value at all means no warning unit, not an offset of zero.
  assert.equal(armCommands({ ...base, role: "early" }, PATHS), null);
  assert.equal(armCommands({ ...base, role: "final" }, PATHS), null);
});

check("cancel stops the timer and the service together", () => {
  const { binary, args } = cancelCommand(["vicinae-shutdown-timer-1", "vicinae-shutdown-timer-2-early"], PATHS);
  assert.equal(binary, PATHS.systemctl);
  assert.deepEqual(args, [
    "--user",
    "stop",
    "vicinae-shutdown-timer-1.timer",
    "vicinae-shutdown-timer-2-early.timer",
    "vicinae-shutdown-timer-1.service",
    "vicinae-shutdown-timer-2-early.service",
  ]);
});

// Captured verbatim from `systemctl --user list-timers 'vicinae-shutdown-timer-*' --no-pager`
// on systemd 262 (262.1-1-arch), 2026-11-03.
const TWO_TIMERS = `NEXT                        LEFT LAST PASSED UNIT                                  ACTIVATES
Tue 2026-11-03 15:53:35 MSK 9min -         - vicinae-shutdown-timer-probe113.timer vicinae-shutdown-timer-probe113.service
Tue 2026-11-03 15:53:35 MSK 9min -         - vicinae-shutdown-timer-probe114.timer vicinae-shutdown-timer-probe114.service

2 timers listed.
Pass --all to see loaded but inactive timers, too.
`;

const NO_TIMERS = `NEXT LEFT LAST PASSED UNIT ACTIVATES

0 timers listed.
Pass --all to see loaded but inactive timers, too.
`;

check("the live timer units come out of the table", () => {
  assert.deepEqual(parseTimerUnits(TWO_TIMERS), [
    "vicinae-shutdown-timer-probe113",
    "vicinae-shutdown-timer-probe114",
  ]);
  assert.deepEqual(parseTimerUnits(NO_TIMERS), []);
  assert.deepEqual(parseTimerUnits(""), []);
});

check("columns with spaces in them do not shift the unit name", () => {
  // LEFT and the NEXT timestamp are both multi-token, and a timezone name can be
  // more than one word, so the unit is read from the right, not by index.
  const wide = `NEXT LEFT LAST PASSED UNIT ACTIVATES
Tue 2026-11-03 23:30:00 GMT Plus 1 hour 2 min 3 s -  vicinae-shutdown-timer-42.timer vicinae-shutdown-timer-42.service

1 timers listed.
`;
  assert.deepEqual(parseTimerUnits(wide), ["vicinae-shutdown-timer-42"]);
});

check("another user's or another tool's unit is not ours to cancel", () => {
  const foreign = `NEXT LEFT LAST PASSED UNIT ACTIVATES
Tue 2026-11-03 23:30:00 MSK 9min - - mpd.timer mpd.service
Tue 2026-11-03 23:30:00 MSK 9min - - vicinae-something-else.timer vicinae-something-else.service

2 timers listed.
`;
  assert.deepEqual(parseTimerUnits(foreign), []);
});

// Captured verbatim: `systemctl --user is-active A.timer B.timer` on systemd 262
// printed one state per unit and still exited 0. The exit code is not the answer.
const IS_ACTIVE = "active\ninactive\n";

check("is-active answers per unit, in the order asked", () => {
  const states = parseActiveStates(IS_ACTIVE, ["a", "b"]);
  assert.deepEqual(states, { a: true, b: false });
});

check("a missing line is not read as active", () => {
  assert.deepEqual(parseActiveStates("active\n", ["a", "b"]), { a: true, b: false });
  assert.deepEqual(parseActiveStates("", ["a"]), { a: false });
});

// Captured verbatim: `busctl call org.freedesktop.login1 /org/freedesktop/login1
// org.freedesktop.login1.Manager CanPowerOff` → `s "yes"`; CanHibernate → `s "na"`.
check("the logind capability answers are read, not guessed", () => {
  assert.deepEqual(parseCapability('s "yes"'), { allowed: true });
  assert.deepEqual(parseCapability('s "na"'), {
    allowed: false,
    reason: "not available on this machine",
  });
  assert.deepEqual(parseCapability('s "challenge"'), {
    allowed: false,
    reason: "needs authentication this session cannot give",
  });
  assert.deepEqual(parseCapability('s "busy"'), { allowed: false, reason: "another action is in progress" });
  assert.deepEqual(parseCapability('s "concurrent"'), { allowed: false, reason: "another session is active" });
  // An unreadable answer is refused with words, never treated as permission.
  assert.equal(parseCapability("").allowed, false);
  assert.match(parseCapability("garbage").reason ?? "", /could not read/);
});

check("a timer that is gone either ran or was cancelled", () => {
  const due = 1_000;
  // The deadline has passed: the action ran, and --collect took the units with it.
  assert.equal(classifyDisappearance(due, 1_200), "ran");
  assert.equal(classifyDisappearance(due, 1_000), "ran");
  // Still due: something outside the extension stopped it.
  assert.equal(classifyDisappearance(due, 900), "cancelled");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
