import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  combineSinkArgs,
  newGroupSinkName,
  parseOutputGroups,
  ungroupTarget,
  type OutputGroup,
} from "../src/utils/outputGroups.ts";
import {
  bluetoothAddressForSink,
  bluetoothConnectFailed,
  isPipeWireServer,
} from "../src/utils/audioServer.ts";

const execFileAsync = promisify(execFile);

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}

async function liveServerCheck(): Promise<void> {
  const name = "live: pactl reports a server kind";
  try {
    const { stdout } = await execFileAsync("pactl", ["info"], { timeout: 2500 });
    const serverName = /^Server Name: (.+)$/m.exec(stdout)?.[1];
    assert.ok(serverName, "no Server Name line");
    assert.equal(typeof isPipeWireServer(serverName), "boolean");
    passed++;
    console.log(`ok   ${name} (${serverName})`);
  } catch (error) {
    skip(name, (error as Error).message);
  }
}

async function main(): Promise<void> {
  const shortModules = [
    "1\tmodule-rt\t",
    "51\tmodule-combine-sink\tsink_name=audio_control_group_1700000000_1 sinks=alsa_output.a,alsa_output.b",
    "52\tmodule-null-sink\tsink_name=ignored",
    "",
  ].join("\n");

  await check("parses combine sinks and ignores other modules", () => {
    assert.deepEqual(parseOutputGroups(shortModules), [
      {
        moduleId: 51,
        sinkName: "audio_control_group_1700000000_1",
        members: ["alsa_output.a", "alsa_output.b"],
      },
    ]);
  });

  await check("reads the legacy slaves= spelling", () => {
    const groups = parseOutputGroups(
      "7\tmodule-combine-sink\tsink_name=legacy slaves=alsa_output.a",
    );
    assert.deepEqual(groups, [
      { moduleId: 7, sinkName: "legacy", members: ["alsa_output.a"] },
    ]);
  });

  await check("skips combine modules without a sink name or members", () => {
    assert.deepEqual(
      parseOutputGroups(
        [
          "8\tmodule-combine-sink\tsinks=alsa_output.a",
          "9\tmodule-combine-sink\tsink_name=no_members",
        ].join("\n"),
      ),
      [],
    );
  });

  await check("builds PipeWire argument with sinks=", () => {
    assert.deepEqual(
      combineSinkArgs({
        sinkName: "group",
        members: ["a", "b"],
        pipewire: true,
      }),
      ["sink_name=group", "sinks=a,b"],
    );
  });

  await check("builds PulseAudio argument with slaves=", () => {
    assert.deepEqual(
      combineSinkArgs({ sinkName: "group", members: ["a"], pipewire: false }),
      ["sink_name=group", "slaves=a"],
    );
  });

  await check("group sink names are unique per time and counter", () => {
    assert.equal(
      newGroupSinkName(1_700_000_000, 2),
      "audio_control_group_1700000000_2",
    );
  });

  await check("ungroup target is the first member that still exists", () => {
    const group: OutputGroup = {
      moduleId: 1,
      sinkName: "group",
      members: ["gone", "a", "b"],
    };
    assert.equal(ungroupTarget(group, ["group", "a", "b"]), "a");
    assert.equal(ungroupTarget(group, ["group", "b"]), "b");
  });

  await check("ungroup target is undefined when no member survives", () => {
    const group: OutputGroup = {
      moduleId: 1,
      sinkName: "group",
      members: ["gone"],
    };
    assert.equal(ungroupTarget(group, ["group"]), undefined);
  });

  await check("finds the Bluetooth address in sink properties", () => {
    assert.equal(
      bluetoothAddressForSink({
        name: "bluez_output.1C_52_16_B4_7F_F7.1",
        properties: { "api.bluez5.address": "1C:52:16:B4:7F:F7" },
      }),
      "1C:52:16:B4:7F:F7",
    );
  });

  await check("falls back to the bluez sink name", () => {
    assert.equal(
      bluetoothAddressForSink({ name: "bluez_output.1C_52_16_B4_7F_F7.1" }),
      "1C:52:16:B4:7F:F7",
    );
  });

  await check("a wired sink has no Bluetooth address", () => {
    assert.equal(
      bluetoothAddressForSink({
        name: "alsa_output.pci-0000_00_1b.0.analog-stereo",
        properties: { "device.bus": "pci" },
      }),
      undefined,
    );
  });

  await check("an already-connected device is not a failed reconnect", () => {
    assert.equal(
      bluetoothConnectFailed(
        "Attempting to connect\nFailed to connect: org.bluez.Error.AlreadyConnected",
      ),
      false,
    );
    assert.equal(
      bluetoothConnectFailed(
        "Attempting to connect\nFailed to connect: org.bluez.Error.Failed",
      ),
      true,
    );
    assert.equal(bluetoothConnectFailed("Device 00:00 not available"), true);
    assert.equal(bluetoothConnectFailed("Connection successful"), false);
  });

  await check("detects a PipeWire server and a plain PulseAudio server", () => {
    assert.equal(isPipeWireServer("PulseAudio (on PipeWire 1.6.9)"), true);
    assert.equal(isPipeWireServer("pulseaudio"), false);
    assert.equal(isPipeWireServer(undefined), false);
  });

  await liveServerCheck();

  console.log(
    failed === 0
      ? `\n${passed} passed, ${skipped} skipped`
      : `\n${failed} check(s) failed, ${skipped} skipped`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
