import assert from "node:assert/strict";

import {
  POWER_PROFILES,
  GPU_MODES,
  classifyFailure,
  deviceClassLabel,
  gpuArgs,
  gpuDevicesMarkdown,
  parseGpuDevices,
  parseStatus,
  profileArgs,
  statusMarkdown,
  tdpArgs,
  vendorName,
} from "../src/utils/vectis.ts";

let passed = 0;
let failed = 0;

/** Verbatim `vectis status --json` from this machine. */
const REAL_STATUS =
  '{"active_profile":"performance","power_backend":"tlp","tlp_service_active":true,' +
  '"tdp_pl1_watts":25,"tdp_pl2_watts":32,"gpu_mode":"integrated","gpu_power_state":"Off",' +
  '"gpu_pending":null,"gpu_last_auto_apply_error":null,"conflicting_services":[]}';

/** Verbatim `vectis gpu-list` from this machine. */
const REAL_GPU_LIST =
  '[{"address":"0000:01:00.0","class":"0x030200","device":"0x0fdf","driver":null,"vendor":"0x10de"},' +
  '{"address":"0000:00:02.0","class":"0x030000","device":"0x0166","driver":"i915","vendor":"0x8086"}]';

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 6).join("\n     ")}`);
  }
}

// ---------------------------------------------------------------------------
// Argument construction. argv only: a shell string here would let a value with
// a space or a quote in it change the command that runs.
// ---------------------------------------------------------------------------

check("profile arguments are a plain argv pair", () => {
  assert.deepEqual(profileArgs("balanced"), ["profile", "balanced"]);
  assert.deepEqual(profileArgs("powersave"), ["profile", "powersave"]);
  assert.deepEqual(profileArgs("performance"), ["profile", "performance"]);
});

check("an unknown profile is rejected rather than passed through", () => {
  // The daemon rejects it too, but a typo here would reach `tlp` as a
  // subcommand name if it were forwarded.
  assert.equal(profileArgs("PowerSave"), null);
  assert.equal(profileArgs(""), null);
  assert.equal(profileArgs("performance; reboot"), null);
  assert.equal(profileArgs("performance && reboot"), null);
});

check("gpu arguments carry the mode and nothing else by default", () => {
  assert.deepEqual(gpuArgs("integrated"), ["gpu", "integrated"]);
  assert.deepEqual(gpuArgs("discrete"), ["gpu", "discrete"]);
  assert.deepEqual(gpuArgs("hybrid"), ["gpu", "hybrid"]);
});

check("--force and --nouveau are opt-in flags, never defaults", () => {
  assert.deepEqual(gpuArgs("hybrid", { force: true }), ["gpu", "hybrid", "--force"]);
  assert.deepEqual(gpuArgs("hybrid", { nouveau: true }), ["gpu", "hybrid", "--nouveau"]);
  assert.deepEqual(gpuArgs("hybrid", { force: true, nouveau: true }), [
    "gpu",
    "hybrid",
    "--nouveau",
    "--force",
  ]);
  // Integrated powers the discrete card off, so the proprietary-versus-open
  // driver question does not arise there and vectisd would ignore the flag.
  assert.deepEqual(gpuArgs("integrated", { nouveau: true }), ["gpu", "integrated"]);
  // Discrete is the one mode where the nvidia driver is loaded, so --nouveau is
  // exactly where it means something.
  assert.deepEqual(gpuArgs("discrete", { nouveau: true }), ["gpu", "discrete", "--nouveau"]);
});

check("an unknown gpu mode is rejected", () => {
  assert.equal(gpuArgs("on"), null);
  assert.equal(gpuArgs("hybrid; rm -rf /"), null);
});

check("tdp omits every limit that was left blank", () => {
  // The daemon reads 0 as "unset", so sending `--pl1 0` would be identical to
  // omitting it -- but sending a literal 0 is confusing in a log.
  assert.deepEqual(tdpArgs({}), ["tdp"]);
  assert.deepEqual(tdpArgs({ pl1: 15 }), ["tdp", "--pl1", "15"]);
  assert.deepEqual(tdpArgs({ pl1: 15, pl2: 25 }), ["tdp", "--pl1", "15", "--pl2", "25"]);
  assert.deepEqual(tdpArgs({ tau: 28000 }), ["tdp", "--tau", "28000"]);
});

check("hard-lock is a flag and never carries a value", () => {
  assert.deepEqual(tdpArgs({ pl1: 15, hardLock: true }), ["tdp", "--pl1", "15", "--hard-lock"]);
  assert.deepEqual(tdpArgs({ hardLock: true }), ["tdp", "--hard-lock"]);
});

check("negative and non-finite watts are rejected, not silently coerced", () => {
  // A negative would reach `constraint_0_power_limit_uw` as a negative number of
  // microwatts after the u32 conversion in the CLI.
  assert.equal(tdpArgs({ pl1: -1 }), null);
  assert.equal(tdpArgs({ pl2: -5, hardLock: true }), null);
  assert.equal(tdpArgs({ tau: Number.NaN }), null);
  assert.equal(tdpArgs({ tau: Number.POSITIVE_INFINITY }), null);
});

check("fractional watts are refused rather than rounded", () => {
  // A half watt is not a thing RAPL can hold, and clap would reject it as a
  // non-integer for u32 anyway. Refusing here gives a message that names the
  // field, instead of "invalid digit" from an argument parser.
  assert.equal(tdpArgs({ pl1: 15.5 }), null);
  assert.equal(tdpArgs({ tau: 976.5 }), null);
  assert.equal(tdpArgs({ pl1: 1e21 }), null, "a value beyond u32 is refused");
  assert.deepEqual(tdpArgs({ pl1: 15 }), ["tdp", "--pl1", "15"]);
});

// ---------------------------------------------------------------------------
// Parsing output from another program
// ---------------------------------------------------------------------------

check("status parses a real vectisd payload", () => {
  const status = parseStatus(REAL_STATUS);

  assert.ok(status);
  assert.equal(status.activeProfile, "performance");
  assert.equal(status.powerBackend, "tlp");
  assert.equal(status.tlpServiceActive, true);
  assert.equal(status.tdpPl1Watts, 25);
  assert.equal(status.tdpPl2Watts, 32);
  assert.equal(status.gpuMode, "integrated");
  assert.equal(status.gpuPowerState, "Off");
  assert.equal(status.gpuPending, null);
  assert.equal(status.gpuLastAutoApplyError, null);
  assert.deepEqual(status.conflictingServices, []);
});

check("status tolerates every field being null", () => {
  // The daemon serialises Option<T> as null, and a machine with no RAPL zone
  // reports null watts. None of that is an error.
  const status = parseStatus(
    '{"active_profile":null,"power_backend":"tlp","tlp_service_active":false,' +
      '"tdp_pl1_watts":null,"tdp_pl2_watts":null,"gpu_mode":null,"gpu_power_state":"Unknown",' +
      '"gpu_pending":"hybrid","gpu_last_auto_apply_error":"bbswitch timed out","conflicting_services":["supergfxd.service"]}',
  );

  assert.ok(status);
  assert.equal(status.activeProfile, null);
  assert.equal(status.tdpPl1Watts, null);
  assert.equal(status.gpuMode, null);
  assert.equal(status.gpuPending, "hybrid");
  assert.equal(status.gpuLastAutoApplyError, "bbswitch timed out");
  assert.deepEqual(status.conflictingServices, ["supergfxd.service"]);
});

check("status rejects output that is not a status object", () => {
  assert.equal(parseStatus(""), null);
  assert.equal(parseStatus("not json"), null);
  assert.equal(parseStatus("[]"), null);
  assert.equal(parseStatus('{"power_backend":"tlp"}'), null, "a missing gpu_mode is not a status");
  // A value of the wrong type must not slip through as undefined.
  assert.equal(parseStatus('{"active_profile":"performance","power_backend":"tlp","tlp_service_active":true,"tdp_pl1_watts":"25","tdp_pl2_watts":32,"gpu_mode":"integrated","gpu_power_state":"Off","gpu_pending":null,"gpu_last_auto_apply_error":null,"conflicting_services":[]}'), null);
});

check("gpu devices parse a real gpu-list payload", () => {
  const devices = parseGpuDevices(REAL_GPU_LIST);

  assert.equal(devices.length, 2);
  assert.deepEqual(devices[0], {
    address: "0000:01:00.0",
    vendor: "0x10de",
    device: "0x0fdf",
    driver: null,
    classId: "0x030200",
    vendorName: "NVIDIA",
    isDiscrete: true,
  });
  assert.equal(devices[1]?.vendorName, "Intel");
  assert.equal(devices[1]?.driver, "i915");
});

check("gpu devices reject malformed input instead of rendering half a list", () => {
  assert.deepEqual(parseGpuDevices("[]"), []);
  assert.deepEqual(parseGpuDevices("not json"), []);
  assert.deepEqual(parseGpuDevices('[{"address":"0000:01:00.0"}]'), [], "a device with no vendor is dropped");
  assert.deepEqual(parseGpuDevices('["0000:01:00.0"]'), []);
});

check("PCI vendor ids map to names, unknown ones stay hex", () => {
  assert.equal(vendorName("0x10de"), "NVIDIA");
  assert.equal(vendorName("0x8086"), "Intel");
  assert.equal(vendorName("0x1002"), "AMD");
  assert.equal(vendorName("0x1022"), "AMD");
  assert.equal(vendorName("0x10de".toUpperCase()), "NVIDIA");
  assert.equal(vendorName("0xdead"), "0xdead");
});

check("PCI class distinguishes the display controller from a 3D controller", () => {
  assert.equal(deviceClassLabel("0x030000"), "VGA compatible controller");
  assert.equal(deviceClassLabel("0x030200"), "3D controller");
  assert.equal(deviceClassLabel("0x038000"), "0x038000");
});

// ---------------------------------------------------------------------------
// Failure classification. Every string below was produced by the real daemon
// or the real CLI on this machine; wording drift is caught by re-running them.
// ---------------------------------------------------------------------------

check("a stopped daemon is reported as such, with the fix", () => {
  const failure = classifyFailure(
    "error: failed to reach vectisd (is it running? sudo systemctl status vectisd): " +
      "org.freedesktop.DBus.Error.ServiceUnknown: The name org.vectis.Daemon1 was not provided by any .service files",
  );
  assert.equal(failure.kind, "daemon-down");
  assert.match(failure.message, /systemctl enable --now vectisd/);
});

check("a missing system bus is distinguished from a stopped daemon", () => {
  const failure = classifyFailure("failed to connect to system bus: Could not parse server address");
  assert.equal(failure.kind, "bus-unreachable");
  assert.match(failure.message, /dbus/i);
});

check("a polkit refusal is reported as a permission problem, not a crash", () => {
  const failure = classifyFailure(
    "error: org.freedesktop.DBus.Error.AccessDenied: not authorized for org.vectis.apply-profile",
  );
  assert.equal(failure.kind, "unauthorized");
  assert.match(failure.message, /org\.vectis\.apply-profile/);
});

check("an unknown profile names the profiles that do exist", () => {
  const failure = classifyFailure(
    "error: org.freedesktop.DBus.Error.Failed: unknown profile 'nonsense' " +
      "(expected powersave|balanced|performance)",
  );
  assert.equal(failure.kind, "invalid-profile");
  assert.match(failure.message, /powersave/);
});

check("an unknown gpu mode names the modes that do exist", () => {
  const failure = classifyFailure(
    "error: org.freedesktop.DBus.Error.Failed: unknown gpu mode 'nonsense' (expected integrated|discrete|hybrid)",
  );
  assert.equal(failure.kind, "invalid-gpu-mode");
  assert.match(failure.message, /integrated/);
});

check("a missing RAPL zone says so instead of showing a generic failure", () => {
  const failure = classifyFailure("RAPL not supported on this system");
  assert.equal(failure.kind, "rapl-unsupported");
});

check("a slow backend is named as slow, not as a rejected setting", () => {
  // Captured from vectisd's journal while probing this machine: TLP occasionally
  // overruns vectisd's own 15s budget when it regenerates udev rules.
  const failure = classifyFailure(
    "error: org.freedesktop.DBus.Error.Failed: tlp balanced timed out after 15s",
  );
  assert.equal(failure.kind, "backend-slow");
  assert.match(failure.message, /tlp balanced/);
  assert.match(failure.message, /not applied/, "the user must know the setting did not take");
  assert.match(failure.message, /COMMAND_TIMEOUT/, "and where the limit lives");

  // The journal's own wording differs from the D-Bus error's; both are real.
  const journal = classifyFailure(
    "vectisd::procutil: procutil: 'tlp power-saver' exceeded 15s, killing it",
  );
  assert.equal(journal.kind, "backend-slow");
  assert.match(journal.message, /tlp power-saver/);
});

check("an unrecognised failure keeps the daemon's own words", () => {
  const failure = classifyFailure("error: org.freedesktop.DBus.Error.Failed: bbswitch write failed");
  assert.equal(failure.kind, "unknown");
  assert.match(failure.message, /bbswitch write failed/);
});

check("an empty stderr still yields something a user can act on", () => {
  const failure = classifyFailure("");
  assert.equal(failure.kind, "unknown");
  assert.ok(failure.message.length > 0);
});

check("classification looks at the whole message, not just its first line", () => {
  const failure = classifyFailure(
    "Cloning into 'x'...\nfatal: could not read Username for 'https://github.com': " +
      "No such device or address",
  );
  assert.equal(failure.kind, "unknown");
});

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

check("the status view reports every field the daemon reports", () => {
  const markdown = statusMarkdown({
    activeProfile: "performance",
    powerBackend: "tlp",
    tlpServiceActive: true,
    tdpPl1Watts: 25,
    tdpPl2Watts: 32,
    gpuMode: "integrated",
    gpuPowerState: "Off",
    gpuPending: "hybrid",
    gpuLastAutoApplyError: null,
    conflictingServices: [],
  });

  assert.match(markdown, /performance/);
  assert.match(markdown, /tlp/);
  assert.match(markdown, /25/);
  assert.match(markdown, /32/);
  assert.match(markdown, /integrated/);
  assert.match(markdown, /Off/);
  // A queued switch is the one thing a user must not miss, so it is called out.
  assert.match(markdown, /hybrid/);
});

check("a missing RAPL zone reads as 'unknown', not as 0 W", () => {
  const markdown = statusMarkdown({
    activeProfile: null,
    powerBackend: "ppd",
    tlpServiceActive: false,
    tdpPl1Watts: null,
    tdpPl2Watts: null,
    gpuMode: null,
    gpuPowerState: "Unknown",
    gpuPending: null,
    gpuLastAutoApplyError: null,
    conflictingServices: [],
  });

  assert.doesNotMatch(markdown, /0W/);
  assert.match(markdown, /unknown/i);
});

check("a failed auto-apply is surfaced, not buried", () => {
  const markdown = statusMarkdown({
    activeProfile: "balanced",
    powerBackend: "tlp",
    tlpServiceActive: true,
    tdpPl1Watts: null,
    tdpPl2Watts: null,
    gpuMode: "integrated",
    gpuPowerState: "Off",
    gpuPending: null,
    gpuLastAutoApplyError: "bbswitch timed out after 5s",
    conflictingServices: [],
  });

  assert.match(markdown, /bbswitch timed out after 5s/);
});

check("conflicting services are listed when present", () => {
  const markdown = statusMarkdown({
    activeProfile: "balanced",
    powerBackend: "tlp",
    tlpServiceActive: true,
    tdpPl1Watts: null,
    tdpPl2Watts: null,
    gpuMode: "hybrid",
    gpuPowerState: "On",
    gpuPending: null,
    gpuLastAutoApplyError: null,
    conflictingServices: ["supergfxd.service", "optimus-manager.service"],
  });

  assert.match(markdown, /supergfxd\.service/);
  assert.match(markdown, /optimus-manager\.service/);
});

check("the device list names each card and says whether a driver is bound", () => {
  const markdown = gpuDevicesMarkdown(parseGpuDevices(REAL_GPU_LIST));

  assert.match(markdown, /0000:01:00\.0/);
  assert.match(markdown, /NVIDIA/);
  // The discrete card has no driver bound in integrated mode, and saying so is
  // the whole reason this list is worth showing.
  assert.match(markdown, /no driver bound/);
  assert.match(markdown, /i915/);
  assert.match(markdown, /3D controller/);
});

check("an empty device list says so instead of rendering a blank section", () => {
  const markdown = gpuDevicesMarkdown([]);
  assert.match(markdown, /returned nothing/);
});

// ---------------------------------------------------------------------------
// The lists the UI renders
// ---------------------------------------------------------------------------

check("the three profiles are the ones the daemon accepts", () => {
  // Profile::from_str in vectis-common/src/types.rs accepts exactly these three,
  // and passes each to `tlp` under a different subcommand name.
  assert.deepEqual(
    POWER_PROFILES.map((p) => p.value),
    ["powersave", "balanced", "performance"],
  );
  assert.equal(POWER_PROFILES.find((p) => p.value === "powersave")?.tlpSubcommand, "power-saver");
  assert.equal(POWER_PROFILES.find((p) => p.value === "balanced")?.tlpSubcommand, "balanced");
  assert.equal(POWER_PROFILES.find((p) => p.value === "performance")?.tlpSubcommand, "performance");
});

check("the three gpu modes are the ones the daemon accepts", () => {
  assert.deepEqual(
    GPU_MODES.map((m) => m.value),
    ["integrated", "hybrid", "discrete"],
  );
});

check("every profile and mode has a description, since each row shows one", () => {
  for (const item of [...POWER_PROFILES, ...GPU_MODES]) {
    assert.ok(item.description.length > 10, `${item.value} needs a description`);
    assert.ok(item.keywords.length > 0, `${item.value} needs keywords to be searchable`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;