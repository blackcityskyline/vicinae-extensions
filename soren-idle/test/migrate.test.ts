import assert from "node:assert/strict";

import { newGame } from "../src/engine/engine.ts";
import { SAVE_VERSION } from "../src/engine/data/game.ts";
import { exportSave, importSave, migrateSave } from "../src/engine/migrate.ts";
import { GameState } from "../src/engine/types.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

const AT = 1_700_000_000_000;

/** A save as an older build wrote it, with the fields `migrateSave` reads. */
function oldSave(version: number, extra: Partial<GameState> = {}): Partial<GameState> {
  const base = newGame(AT);
  return { ...base, version, ...extra };
}

// v1: a beacon meant "rescued". It now means contact made, and the hints the
// save has grown past are not shown again.
check("v1: a built beacon counts as contact at the last tick", () => {
  const base = newGame(AT);
  const state = migrateSave(
    oldSave(1, { hp: 1, buildings: { ...base.buildings, beacon: 1 }, contactAt: null }),
  );
  assert.equal(state.contactAt, AT);
  assert.equal(state.version, SAVE_VERSION);
  assert.ok(!state.hints.includes("low_hp"), "the low-health hint is skipped");
  assert.ok(state.hints.includes("welcome"), "hints that still apply are kept");
});

// v2: gear used to count just by being owned, so the next save has to wear it.
check("v2: owned gear is equipped", () => {
  const state = migrateSave(oldSave(2, { inventory: { cutting_torch: 1 }, equipped: {} }));
  assert.equal(state.equipped.salvager, "cutting_torch");
});

// v3: gear moved from Engineering to Fabrication; the level has to follow.
check("v3: the engineering level moves to fabrication", () => {
  const base = newGame(AT);
  const state = migrateSave(
    oldSave(3, { xp: { ...base.xp, engineering: 500, fabrication: 120 } }),
  );
  assert.equal(state.xp.fabrication, 500);
  assert.equal(state.xp.engineering, 500);
});

// Every step runs for a save that was never migrated before.
check("a v1 save is taken through every step to the current version", () => {
  const base = newGame(AT);
  const state = migrateSave(
    oldSave(1, {
      hp: 1,
      buildings: { ...base.buildings, beacon: 1 },
      inventory: { cutting_torch: 1 },
      equipped: {},
      xp: { ...base.xp, engineering: 500 },
    }),
  );
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(state.contactAt, AT);
  assert.equal(state.equipped.salvager, "cutting_torch");
  assert.equal(state.xp.fabrication, 500);
});

check("a save at the current version is left as it was", () => {
  const base = newGame(AT);
  const state = migrateSave({ ...base, version: SAVE_VERSION, xp: { ...base.xp, engineering: 42 } });
  assert.equal(state.xp.engineering, 42);
});

check("export and import round trip the migrated save", () => {
  const base = newGame(AT);
  const migrated = migrateSave(
    oldSave(1, {
      hp: 1,
      buildings: { ...base.buildings, beacon: 1 },
      inventory: { cutting_torch: 1 },
      xp: { ...base.xp, engineering: 500 },
    }),
  );
  assert.deepEqual(importSave(exportSave(migrated)), { state: migrated });
});

check("text that is not a save is refused", () => {
  assert.equal(importSave("not a save").error, "The clipboard does not contain a save");
  assert.equal(importSave("{}").error, "The clipboard does not contain a save");
});

check("a save from a newer build is refused instead of being played", () => {
  const base = newGame(AT);
  const result = importSave(JSON.stringify({ ...base, version: SAVE_VERSION + 1 }));
  assert.equal(result.error, "This save is from a newer version of Soren Idle");
  assert.equal(result.state, undefined);
});

check("a save with the wrong shape names the damaged record", () => {
  const base = newGame(AT);
  const result = importSave(JSON.stringify({ ...base, xp: { ...base.xp, mining: "lots" } }));
  assert.equal(result.error, "The save is damaged (xp)");
  assert.equal(result.state, undefined);
});

console.log(`\n${checks} check(s) passed`);
