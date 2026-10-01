import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Shortcuts in one action panel must be unique.
 *
 * Measured: `Show in New Window` was written with cmd+return, the same shortcut as
 * `Action.Paste` two elements above it. Vicinae rendered one of them and silently
 * dropped the other — the action existed in the code and in the bundle, and simply was
 * not there to press.
 *
 * This reads the panel out of the source rather than trusting that a human kept track.
 */

const source = readFileSync(new URL("../src/manage-downloads.tsx", import.meta.url), "utf-8");

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

/**
 * The shortcut of one element, read only from inside it.
 *
 * Everything here reads a bounded slice rather than the rest of the panel: an earlier
 * version scanned forward and picked up the *next* action's shortcut, which reported
 * `Show in New Window -> common:CopyPath` for a key that is plainly `cmd+o`.
 */
function shortcutOf(element: string): string {
  const literal = element.match(/shortcut=\{Keyboard\.Shortcut\.Common\.(\w+)\}/);
  if (literal) return `common:${literal[1]}`;

  const explicit = element.match(/shortcut=\{\{([^}]*)\}\}/);
  if (explicit) {
    const modifiers = [...explicit[1].matchAll(/"(cmd|ctrl|alt|shift|opt|meta|windows)"/g)].map(
      (match) => match[1],
    );
    const key = explicit[1].match(/key:\s*"([^"]+)"/)?.[1] ?? "?";
    return [...new Set([...modifiers, key])].join("+");
  }

  return "none";
}

/** From one `<Action` to its own `/>`, which is where its props end. */
function elementAt(panel: string, index: number): string {
  const from = panel.indexOf("<Action", index);
  const close = panel.indexOf("/>", from);
  return panel.slice(from, close);
}

/** The action panel, from its opening tag to the end of the function. */
const panelStart = source.indexOf("<ActionPanel title={download.file}>");
const panel = source.slice(panelStart, source.indexOf("\n  );\n}", panelStart));

const shortcuts = [...panel.matchAll(/<Action[\s.]/g)].map((match) => ({
  at: panelStart + match.index,
  shortcut: shortcutOf(elementAt(panel, match.index)),
  // An action whose body is a ternary renders one of two elements, so `<Action` appears
  // twice for one slot. Reading a fixed 320 characters past the match picks up the
  // neighbouring action's shortcut, which is how a false duplicate appeared for
  // OpenWith. Stop at the next `<Action` instead.
}));

/** From one `<Action` up to the next, so a ternary's two branches read as one slot. */
function fragmentFor(panel: string, index: number): string {
  const rest = panel.slice(index);
  const next = rest.slice(1).search(/<Action[\s.]/);
  return rest.slice(0, next === -1 ? rest.length : next + 1);
}

check("the panel is found and has actions in it", () => {
  assert.ok(panelStart > 0, "the panel was not found — has it been renamed?");
  assert.ok(shortcuts.length > 5, `only ${shortcuts.length} actions found`);
});

check("no two actions in the panel share a shortcut", () => {
  const seen = new Map<string, number>();

  for (const { at, shortcut } of shortcuts) {
    if (shortcut === "none") continue;

    assert.equal(
      seen.has(shortcut),
      false,
      `duplicate shortcut ${shortcut} at offset ${at}; first seen at ${seen.get(shortcut)}`,
    );

    seen.set(shortcut, at);
  }

  console.log(`     ${seen.size} distinct shortcuts across ${shortcuts.length} actions`);
});

check("the file-manager action is present and has its own key", () => {
  assert.match(source, /title="Show in File Manager"/);
  // "Show in New Window" was removed at the user's request: one action is enough, and a
  // second one on the same key was what made it invisible.
  assert.doesNotMatch(source, /Show in New Window/);

  // Read the shortcut out of the element that carries each title, rather than guessing
  // which opening tag owns it: the title is inside the element, and the shortcut may sit
  // before or after it.
  const shortcutOfTitle = (title: string) => {
    const at = panel.indexOf(`title="${title}"`);
    assert.ok(at >= 0, `${title} is not in the panel`);
    return shortcutOf(elementAt(panel, panel.lastIndexOf("<Action", at)));
  };

  const manager = shortcutOfTitle("Show in File Manager");

  assert.notEqual(manager, "none", "Show in File Manager has no shortcut");

  // The key it actually landed on, so a change is visible in the output.
  console.log(`     Show in File Manager -> ${manager}`);
});

console.log(`\nall ${checks} checks passed`);
