import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import commandsRaw from "../src/commands.json";
import { formatCommandForClipboard, searchKeywordInCommandGroups } from "../src/utils.ts";
import type { CommandGroup } from "../src/types.ts";

/**
 * The favourites list, and the reason it needed a fix.
 *
 * `useLocalStorage<string[]>("vim-bro-favorites")` crashed on first launch with
 * `TypeError: Cannot read properties of null (reading 'includes')`. Upstream wrote:
 *
 *   const { value: favorites = [] } = useLocalStorage<string[]>("vim-favorites");
 *
 * and that default is correct for Raycast, where an absent key is `undefined`. It does
 * not help here, because of a difference between the published package and the runtime:
 *
 *   node_modules/@vicinae/api/dist/api/local-storage.js
 *     const value = await getClient().Storage.get(key);
 *     return value ?? undefined;                       <- coerces
 *
 *   /run/user/1000/vicinae/extension-manager.js, the module Vicinae injects for
 *   require("@vicinae/api")
 *     async function c(V){ return pe().Storage.get(V) } <- no coercion
 *
 * So an absent key arrives as `null`, `useLocalStorage` does
 * `typeof item !== "undefined" ? JSON.parse(item) : initialValue`, and `JSON.parse(null)`
 * is `null`. A destructuring default only fires on `undefined`, so `favorites` stayed
 * `null` and `.includes` on it threw.
 *
 * Measured, not inferred: the crash is what first showed it, and the check below reads
 * the source to keep the `?? []` from being tidied away.
 */

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
  }
}

check("an absent key is null here, and undefined is only the package's idea of it", () => {
  // The coercion, written out, because it is the whole bug.
  const fromRuntime = (value: unknown) => value; // what the injected module returns
  const fromPackage = (value: unknown) => value ?? undefined; // what npm ships

  assert.equal(fromRuntime(null), null);
  assert.equal(fromPackage(null), undefined);
  assert.equal(typeof JSON.parse(String(null)), "object");
  assert.equal(JSON.parse(String(null)), null, "JSON.parse(null) is null, not undefined");

  // And the default that does not save it:
  const { value: upstream = [] } = { value: JSON.parse(String(null)) };
  assert.equal(upstream, null, "a destructuring default does not fire on null");
});

check("the source normalises both null and undefined before using the list", () => {
  const raw = readFileSync(join(__dirname, "..", "src", "index.tsx"), "utf-8");

  // Comments are stripped first: the explanation of this very bug quotes the broken line
  // verbatim, and an earlier version of this check tripped over its own comment.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  assert.match(
    source,
    /\?\?\s*\[\]/,
    "no `?? []` anywhere: an absent key is null here and will crash .includes again",
  );
  assert.doesNotMatch(
    source,
    /value:\s*favorites\s*=\s*\[\]/,
    "the destructuring default is back, and it does not fire on null",
  );
});

// The data upstream ships, which is the reason this extension needs no network.
check("the command list is in the repository, and it is not small", () => {
  const groups = commandsRaw as CommandGroup[];
  const commands = groups.flatMap((group) => group.commands);

  assert.ok(groups.length >= 10, `only ${groups.length} groups`);
  assert.ok(commands.length >= 150, `only ${commands.length} commands`);
  assert.ok(commands.every((command) => command.kbd && command.text), "a command has no text");
});

check("searching narrows to the commands that match", () => {
  const groups = commandsRaw as CommandGroup[];

  const all = searchKeywordInCommandGroups("", groups);
  assert.equal(all.length, groups.length, "an empty search must not change anything");

  const found = searchKeywordInCommandGroups("split", groups);
  assert.ok(found.length > 0, "'split' matched nothing");

  const commands = found.flatMap((group) => group.commands);
  assert.ok(commands.length > 0, "a group matched but held no commands");
});

check("a group that matched on its name comes before one that matched on a command", () => {
  // Upstream's ordering, and the reason the result reads the way it does: exact hits on
  // the group name first, then partial, then whatever was found inside commands.
  const groups: CommandGroup[] = [
    { key: "split", commands: [{ kbd: ":sp", text: "split" }] },
    { key: "nothing to do with it", commands: [{ kbd: ":sple", text: "mentions split" }] },
  ];

  const order = searchKeywordInCommandGroups("split", groups).map((group) => group.key);
  assert.deepEqual(order, ["split", "nothing to do with it"]);
});

check("a command with no match leaves an empty group rather than a missing one", () => {
  // Every group is returned, including the ones with nothing left in them, so the list
  // keeps its sections while a search narrows.
  const groups: CommandGroup[] = [
    { key: "a", commands: [{ kbd: ":a", text: "one" }] },
    { key: "b", commands: [{ kbd: ":b", text: "two" }] },
  ];

  const found = searchKeywordInCommandGroups("zzz", groups);
  assert.equal(found.length, 2);
  assert.equal(found.every((group) => group.commands.length === 0), true);
});

check("a leading colon is dropped before copying, so the command pastes into vim", () => {
  // `:w` pasted into a shell is a syntax error; `w` is what is wanted.
  assert.equal(formatCommandForClipboard(":w"), "w");
  assert.equal(formatCommandForClipboard("w"), "w");
  assert.equal(formatCommandForClipboard(":%s/a/b/g"), "%s/a/b/g");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
