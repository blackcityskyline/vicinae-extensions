import assert from "node:assert/strict";

import { uniqueGroupSinkName } from "../src/utils/outputGroups.ts";
import {
  parsePresets,
  planPresetApplication,
  removePreset,
  serializePresets,
  upsertPreset,
  type OutputPreset,
} from "../src/utils/presets.ts";

let passed = 0;
let failed = 0;

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

const preset = (name: string, members: string[], volumePercent = 100): OutputPreset => ({
  name,
  members,
  volumePercent,
});

async function main(): Promise<void> {
  await check("accepts an absent or broken store as empty", () => {
    assert.deepEqual(parsePresets(null), []);
    assert.deepEqual(parsePresets(undefined), []);
    assert.deepEqual(parsePresets(""), []);
    assert.deepEqual(parsePresets("not json"), []);
    assert.deepEqual(parsePresets('{"name":"not an array"}'), []);
  });

  await check("keeps valid presets and drops invalid entries", () => {
    const raw = JSON.stringify([
      { name: " Desk ", members: ["a", "b"], volumePercent: 40 },
      { name: "", members: ["a"], volumePercent: 50 },
      { name: "No members", members: [], volumePercent: 50 },
      { name: "Bad volume", members: ["a"], volumePercent: 500 },
      { name: "Strings", members: "a", volumePercent: 50 },
    ]);
    assert.deepEqual(parsePresets(raw), [
      { name: "Desk", members: ["a", "b"], volumePercent: 40 },
      { name: "Bad volume", members: ["a"], volumePercent: 150 },
    ]);
  });

  await check("clamps volume and removes duplicate members", () => {
    const raw = JSON.stringify([
      { name: "Loud", members: ["a", "a", "b"], volumePercent: 400 },
      { name: "Quiet", members: ["a"], volumePercent: -10 },
    ]);
    assert.deepEqual(parsePresets(raw), [
      { name: "Loud", members: ["a", "b"], volumePercent: 150 },
      { name: "Quiet", members: ["a"], volumePercent: 0 },
    ]);
  });

  await check("round-trips through the stored string", () => {
    const presets = [preset("Наушники + колонки", ["a", "b"], 35)];
    assert.deepEqual(parsePresets(serializePresets(presets)), presets);
  });

  await check("upsert replaces the same name and moves it first", () => {
    const presets = [preset("A", ["a"]), preset("B", ["b"])];
    assert.deepEqual(upsertPreset(presets, preset("b", ["c"], 70)), [
      preset("b", ["c"], 70),
      preset("A", ["a"]),
    ]);
  });

  await check("upsert adds a new name at the front", () => {
    assert.deepEqual(upsertPreset([preset("A", ["a"])], preset("B", ["b"])), [
      preset("B", ["b"]),
      preset("A", ["a"]),
    ]);
  });

  await check("remove drops one preset by name", () => {
    assert.deepEqual(
      removePreset([preset("A", ["a"]), preset("B", ["b"])], "A"),
      [preset("B", ["b"])],
    );
  });

  await check("reuses an existing group with the same members in any order", () => {
    const plan = planPresetApplication(
      preset("Desk", ["b", "a"], 40),
      [{ name: "a" }, { name: "b" }, { name: "group" }],
      [{ moduleId: 1, sinkName: "group", members: ["a", "b"] }],
    );
    assert.deepEqual(plan, {
      kind: "existing-group",
      group: { moduleId: 1, sinkName: "group", members: ["a", "b"] },
    });
  });

  await check("creates a group when the members exist but are not grouped", () => {
    const plan = planPresetApplication(
      preset("Desk", ["a", "b"]),
      [{ name: "a" }, { name: "b" }],
      [],
    );
    assert.deepEqual(plan, { kind: "create-group", members: ["a", "b"] });
  });

  await check("a one-member preset selects that sink", () => {
    const plan = planPresetApplication(preset("Mic", ["a"]), [{ name: "a" }], []);
    assert.deepEqual(plan, { kind: "single", sinkName: "a" });
  });

  await check("names every member that is no longer present", () => {
    const plan = planPresetApplication(
      preset("Desk", ["a", "gone", "also-gone"]),
      [{ name: "a" }],
      [],
    );
    assert.deepEqual(plan, { kind: "missing", missing: ["gone", "also-gone"] });
  });

  await check("a new group name skips the ones already taken", () => {
    assert.equal(
      uniqueGroupSinkName(
        ["audio_control_group_1700000000_1", "audio_control_group_1700000000_2"],
        1_700_000_000,
      ),
      "audio_control_group_1700000000_3",
    );
  });

  await check("a stale group record is not reused", () => {
    const plan = planPresetApplication(
      preset("Desk", ["a", "b"]),
      [{ name: "a" }, { name: "b" }],
      [{ moduleId: 1, sinkName: "group", members: ["a", "b"] }],
    );
    assert.deepEqual(plan, { kind: "create-group", members: ["a", "b"] });
  });

  console.log(
    failed === 0
      ? `\n${passed} passed`
      : `\n${failed} check(s) failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
