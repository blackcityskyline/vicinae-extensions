import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The read half, against history files at the size a real machine has.
 *
 * `history.test.ts` checks the parsers on five-line strings; nothing checked what
 * `readHistory` does to a 700 kB fish file with a cap on top of it. That is where the
 * list can lose history without any parser being wrong: a tail read that starts in the
 * middle of a command, a cap that keeps the oldest entries instead of the newest, a
 * preference that asks for everything and gets 1000.
 *
 * The fixture is generated, not captured, so it is the same everywhere and can be
 * larger than any cap: 8000 fish entries, 1200 undated bash lines and 1500 zsh
 * extended entries. Every command carries its own index, so "the newest 1000" can be
 * compared exactly instead of approximately.
 */

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

const FISH_ENTRIES = 8000;
const BASH_ENTRIES = 1200;
const ZSH_ENTRIES = 1500;
const BASE_WHEN = 1_760_000_000;

const fishCommand = (index: number) => `fish-command-${index} --flag`;
const bashCommand = (index: number) => `bash-command-${index} --flag`;
const zshCommand = (index: number) => `zsh-command-${index} --flag`;

async function main(): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "history-e2e-home-"));
  process.env.HOME = home;
  mkdirSync(join(home, ".local", "share", "fish"), { recursive: true });

  // fish: one `- cmd:` block per command, timestamps one second apart.
  const fish = Array.from({ length: FISH_ENTRIES }, (_, index) => {
    return `- cmd: ${fishCommand(index)}\n  when: ${BASE_WHEN + index}`;
  }).join("\n");
  writeFileSync(join(home, ".local", "share", "fish", "fish_history"), `${fish}\n`);

  // bash: no `#<epoch>` lines, exactly like a shell without HISTTIMEFORMAT.
  writeFileSync(
    join(home, ".bash_history"),
    Array.from({ length: BASH_ENTRIES }, (_, index) => bashCommand(index)).join("\n") + "\n",
  );

  // zsh: the extended format, which is the one that carries a time.
  writeFileSync(
    join(home, ".zsh_history"),
    Array.from({ length: ZSH_ENTRIES }, (_, index) => `: ${BASE_WHEN + index}:0;${zshCommand(index)}`).join("\n") +
      "\n",
  );

  // Imported after the files exist: the paths are resolved at import time.
  const { readHistory } = await import("../src/api/history.ts");
  const { parseEntryLimit } = await import("../src/utils/history.ts");
  const { formatTimestamp, DEFAULT_FORMAT } = await import("../src/utils/time.ts");

  const commandsOf = (entries: { command: string }[]) => entries.map((entry) => entry.command);

  await check("every command in every file is reachable when nothing is capped", async () => {
    const result = await readHistory("all");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const byShell = (shell: string) => result.value.filter((entry) => entry.shell === shell);
    assert.equal(byShell("fish").length, FISH_ENTRIES, "fish entries were dropped");
    assert.equal(byShell("bash").length, BASH_ENTRIES, "bash entries were dropped");
    assert.equal(byShell("zsh").length, ZSH_ENTRIES, "zsh entries were dropped");

    // Not just the count: the first command of each file has to be there too, so a
    // cap or a seam cannot hide inside a correct total.
    for (const [shell, first, count] of [
      ["fish", fishCommand(0), FISH_ENTRIES],
      ["bash", bashCommand(0), BASH_ENTRIES],
      ["zsh", zshCommand(0), ZSH_ENTRIES],
    ] as const) {
      const commands = commandsOf(byShell(shell));
      assert.ok(commands.includes(first), `${shell} lost its oldest entry ${first}`);
      assert.ok(commands.includes(`${shell}-command-${count - 1} --flag`), `${shell} lost its newest entry`);
    }

    console.log(`     ${result.value.length} rows out of ${FISH_ENTRIES + BASH_ENTRIES + ZSH_ENTRIES}`);
  });

  await check("a cap keeps the newest entries of each shell, not the first ones it meets", async () => {
    const result = await readHistory(1000);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const fishCommands = commandsOf(result.value.filter((entry) => entry.shell === "fish"));
    assert.equal(fishCommands.length, 1000);
    assert.equal(fishCommands[0], fishCommand(FISH_ENTRIES - 1), "the newest fish entry is not first");
    assert.ok(fishCommands.includes(fishCommand(FISH_ENTRIES - 1000)), "the 1000th newest fish entry is missing");
    assert.ok(!fishCommands.includes(fishCommand(FISH_ENTRIES - 1001)), "a cap of 1000 returned 1001 entries");

    const zshCommands = commandsOf(result.value.filter((entry) => entry.shell === "zsh"));
    assert.equal(zshCommands.length, 1000);
    assert.equal(zshCommands[0], zshCommand(ZSH_ENTRIES - 1));
  });

  await check("a truncated read never shows half a command", async () => {
    // The cap reads only the tail of the file, so the first line it sees is usually cut
    // in the middle of an entry. A fragment in the list is a command that never ran.
    for (const cap of [500, 1000, 2500]) {
      const result = await readHistory(cap);
      assert.equal(result.ok, true);
      if (!result.ok) return;

      for (const entry of result.value) {
        assert.match(
          entry.command,
          /^(?:fish|bash|zsh)-command-\d+ --flag$/,
          `cap ${cap} surfaced a fragment: ${JSON.stringify(entry.command)}`,
        );
      }
    }
  });

  await check("the merged list runs newest first, and undated entries come after the dated ones", async () => {
    const result = await readHistory(1000);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const times = result.value.map((entry) => entry.when).filter((when): when is number => when !== undefined);
    for (let index = 1; index < times.length; index += 1) {
      const previous = times[index - 1] ?? 0;
      const current = times[index] ?? 0;
      assert.ok(previous >= current, `entry ${index} is newer than the one before it`);
    }

    let lastDated = -1;
    for (let index = 0; index < result.value.length; index += 1) {
      if (result.value[index]?.when !== undefined) lastDated = index;
    }
    assert.equal(lastDated, result.value.length - 1001, "undated bash entries are not all at the bottom");
    assert.equal(formatTimestamp(undefined, DEFAULT_FORMAT), "—", "an entry without a time was given one");
  });

  await check("the preference decides the cap, and 'all' means all", () => {
    assert.equal(parseEntryLimit("all"), "all");
    assert.equal(parseEntryLimit("2500"), 2500);
    assert.equal(parseEntryLimit(""), 1000);
    assert.equal(parseEntryLimit(undefined), 1000);
    assert.equal(parseEntryLimit("0"), 1000);
    assert.equal(parseEntryLimit("junk"), 1000);
  });

  await check("a history file that is not there is reported, not thrown", async () => {
    rmSync(join(home, ".zsh_history"));

    const result = await readHistory("all");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.missing, ["zsh"]);
    assert.equal(result.value.filter((entry) => entry.shell === "zsh").length, 0);
    assert.equal(result.value.length, FISH_ENTRIES + BASH_ENTRIES, "the other shells were affected");
  });

  rmSync(home, { recursive: true, force: true });

  console.log(`\npassed: ${passed}, failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(`FAIL ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
