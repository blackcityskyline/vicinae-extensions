import assert from "node:assert/strict";

/**
 * Self-check for the pure parsers behind the Easy Effects extension.
 *
 * `npm test` runs this with tsx; a non-zero exit fails. The fixtures are the
 * shapes measured from easyeffects 8.3.2, pactl and bluetoothctl.
 */
import {
  type EffectsState,
  parseState,
  stepPreset,
} from "../src/utils/state.ts";
import {
  batteryPercent,
  bluetoothAddress,
  deviceName,
  parseSink,
  type Sink,
} from "../src/utils/output.ts";

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

const RUNNING = [
  "running",
  "2",
  "HD272",
  "Output presets:",
  "1\tHD272",
  "2\tLaptop speakers",
  "",
  "No input presets.",
].join("\n");

check("the CLI output yields the preset, the bypass state and the output presets", () => {
  const state = parseState(RUNNING);
  assert.deepEqual(state, {
    running: true,
    bypassed: false,
    preset: "HD272",
    presets: ["HD272", "Laptop speakers"],
  } satisfies EffectsState);
});

check("a stopped Easy Effects is reported as stopped, not as empty data", () => {
  assert.deepEqual(parseState("stopped\n"), {
    running: false,
    bypassed: false,
    preset: "",
    presets: [],
  });
  assert.equal(parseState("").running, false);
});

check("bypass reads 1 as on and anything else as off", () => {
  assert.equal(parseState("running\n1\n\n").bypassed, true);
  assert.equal(parseState("running\n2\n\n").bypassed, false);
});

check("input presets listed after the output block do not leak in", () => {
  const state = parseState(
    [
      "running",
      "2",
      "HD272",
      "Output presets:",
      "1\tHD272",
      "",
      "Input presets:",
      "1\tMicrophone",
    ].join("\n"),
  );
  assert.deepEqual(state.presets, ["HD272"]);
});

check("stepping wraps, starts at the right end, and refuses to step a single preset", () => {
  assert.equal(stepPreset(["a", "b", "c"], "b", 1), "c");
  assert.equal(stepPreset(["a", "b", "c"], "c", 1), "a");
  assert.equal(stepPreset(["a", "b", "c"], "a", -1), "c");
  assert.equal(stepPreset(["a", "b", "c"], "", 1), "a");
  assert.equal(stepPreset(["a", "b", "c"], "", -1), "c");
  assert.equal(stepPreset(["a"], "a", 1), null);
  assert.equal(stepPreset([], "", 1), null);
});

check("a sink is Bluetooth by its BlueZ address property, then by its name", () => {
  const withProperty: Sink = {
    name: "bluez_output.AC_12_2F_3B_4C_5D.1",
    description: "WH-1000XM4",
    properties: { "api.bluez5.address": "AC:12:2F:3B:4C:5D" },
  };
  assert.equal(bluetoothAddress(withProperty), "AC:12:2F:3B:4C:5D");

  const withName: Sink = {
    name: "bluez_output.AC_12_2F_3B_4C_5D.1",
    description: "WH-1000XM4",
    properties: {},
  };
  assert.equal(bluetoothAddress(withName), "AC:12:2F:3B:4C:5D");

  const analog: Sink = {
    name: "alsa_output.pci-0000_00_1b.0.analog-stereo",
    description: "Built-in Audio Analog Stereo",
    properties: {},
  };
  assert.equal(bluetoothAddress(analog), undefined);
});

check("the default sink is chosen from pactl's JSON, address included", () => {
  const json = JSON.stringify([
    {
      name: "alsa_output.pci-0000_00_1b.0.analog-stereo",
      description: "Built-in Audio Analog Stereo",
      properties: { "device.icon_name": "audio-card-analog" },
    },
    {
      name: "bluez_output.AC_12_2F_3B_4C_5D.1",
      description: "WH-1000XM4",
      properties: {
        "api.bluez5.address": "AC:12:2F:3B:4C:5D",
        "device.icon_name": "audio-headphones-bluetooth",
      },
    },
  ]);
  const sink = parseSink(json, "bluez_output.AC_12_2F_3B_4C_5D.1");
  assert.equal(sink?.description, "WH-1000XM4");
  assert.equal(sink && bluetoothAddress(sink), "AC:12:2F:3B:4C:5D");
  assert.equal(parseSink(json, "missing"), undefined);
  assert.equal(parseSink("not json", "x"), undefined);
});

check("BlueZ's battery line is read as its decimal percentage", () => {
  const info = [
    "Device AC:12:2F:3B:4C:5D (public)",
    "\tName: WH-1000XM4",
    "\tAlias: WH-1000XM4",
    "\tBattery Percentage: 0x5a (90)",
  ].join("\n");
  assert.equal(batteryPercent(info), 90);
  assert.equal(batteryPercent("Battery Percentage: 0x64 (100)"), 100);
  assert.equal(batteryPercent("no battery here"), undefined);
  assert.equal(deviceName(info), "WH-1000XM4");
  assert.equal(deviceName("\tName: Only a name"), "Only a name");
  assert.equal(deviceName("no name"), undefined);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\n8 checks passed");
