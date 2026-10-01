import { execFileSync } from "node:child_process";

/**
 * Two ways to reach the file manager, because the obvious one does not work.
 *
 * `showInFinder()` — which is `showInFileBrowser(path, {select: true})` — resolves to
 * Nautilus's `ShowItems` over D-Bus. Measured on this machine:
 *
 *   folder with no window open    -> a window appears, and it is the right one
 *   folder whose window is open   -> window count unchanged, focus unchanged
 *
 * So the command looks like it does nothing whenever the folder is already on screen,
 * which is most of the time. Two actions cover it:
 *
 *   Enter        switch focus to the window that is already open
 *   Cmd+Enter    ask the file manager for a new window on the file
 *
 * The focus half goes through the compositor, because D-Bus has no way to raise a
 * window. Measured on Hyprland 0.56.2:
 *
 *   hl.dispatch(hl.dsp.focus({window='address:0x…'}))  -> focus moves, 6 of 6
 *   hl.dsp.focus({window='address:0x…'}) on its own     -> does nothing at all
 *
 * That second line is the trap the wiki calls out by name: "Simply writing
 * `hl.dsp.whatever()` on its own will do nothing." Hyprland answers `ok` either way, so
 * a missing wrapper cannot be told from success unless the focus is watched.
 *
 * Selector shapes are from the wiki's *Window selector* section.
 */

/**
 * `hyprctl eval` runs Lua, so only a known selector shape may be passed in. Anything
 * else is data — a path, a file name, a caller's mistake — and is refused rather than
 * pasted into a Lua string.
 */
const SELECTOR =
  /^(?:address:0x[0-9a-fA-F]+|pid:\d+|class:[^'"]+|initialclass:[^'"]+|title:[^'"]+|initialtitle:[^'"]+)$/;

export function isSelector(value: string): boolean {
  return SELECTOR.test(value);
}

/**
 * `hl.dispatch(...)` is the wrapper that makes the call do anything; without it the
 * dispatcher is built and thrown away.
 */
export function focusCommand(selector: string): string {
  if (!isSelector(selector)) throw new Error(`not a Hyprland window selector: ${selector}`);
  return `hl.dispatch(hl.dsp.focus({window='${selector}'}))`;
}

/**
 * `exec_cmd` runs through `sh -c`, so the path is quoted. A download called
 * `it's "x".zip` closes the quote and escapes it instead of ending the argument.
 *
 * Measured: Nautilus's `OpenWindowsWithLocations` opened no window at all on this
 * machine, while `nautilus --new-window <file>` opened one every time.
 */
export function newWindowCommand(path: string): string {
  return `nautilus --new-window -- ${shellQuote(path)}`;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Lua string literal, for embedding a command inside `hl.dsp.exec_cmd`. */
function luaString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const FILE_MANAGERS = [
  "org.gnome.Nautilus",
  "org.kde.dolphin",
  "org.thunar.Thunar",
  "nemo",
  "pcmanfm",
  "Nautilus",
];

type Client = { address: string; class: string; title: string };

function clients(): Client[] {
  try {
    const out = execFileSync("hyprctl", ["clients", "-j"], {
      encoding: "utf-8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(out) as Client[];
  } catch {
    return [];
  }
}

function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

/**
 * The file manager window already showing this path's folder, if there is one.
 *
 * Matched on title because a Wayland window exposes no path. A file manager titles its
 * window after the folder, which is enough here: the only thing asked of it is that it
 * shows the right directory.
 */
export function windowFor(path: string): string | undefined {
  const folder = folderOf(path);
  const title = folder.slice(folder.lastIndexOf("/") + 1);

  return clients().find(
    (client) =>
      FILE_MANAGERS.some((name) => client.class === name || client.class?.startsWith(name)) &&
      client.title === title,
  )?.address;
}

export type Reveal = { kind: "focus"; selector: string } | { kind: "new-window"; command: string };

/**
 * Switch to what is already open before asking for another window. Opening a second
 * window on every press is its own annoyance, and it is what the single upstream action
 * effectively does once `ShowItems` gives up.
 */
export function reveal(path: string): Reveal {
  const address = windowFor(path);

  if (address) return { kind: "focus", selector: `address:${address}` };

  return { kind: "new-window", command: newWindowCommand(path) };
}

/** Run a plan. Best effort: a compositor that is not Hyprland gets nothing, not a crash. */
export function runReveal(path: string): void {
  const plan = reveal(path);

  evalInHyprland(
    plan.kind === "focus"
      ? focusCommand(plan.selector)
      : `hl.dispatch(hl.dsp.exec_cmd(${luaString(plan.command)}))`,
  );
}

function evalInHyprland(lua: string): void {
  try {
    execFileSync("hyprctl", ["eval", lua], { encoding: "utf-8", timeout: 5000 });
  } catch (error) {
    console.warn(`hyprctl eval failed: ${error instanceof Error ? error.message : error}`);
  }
}
