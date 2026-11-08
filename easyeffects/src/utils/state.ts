/** What one read of Easy Effects tells the launcher. */
export interface EffectsState {
  running: boolean;
  /** True when the global bypass is on: every effect is skipped. */
  bypassed: boolean;
  /** The last loaded output preset, or "". */
  preset: string;
  /** Output presets, in Easy Effects' own order. */
  presets: string[];
}

export const STOPPED: EffectsState = {
  running: false,
  bypassed: false,
  preset: "",
  presets: [],
};

/**
 * The CLI prints three answers in a row: `-b 3` (1 or 2), `-a output` (the
 * preset name, an empty line when nothing is loaded) and `-p`:
 *
 *   Output presets:
 *   1	HD272
 *
 *   No input presets.
 *
 * Input presets follow and must not leak into the output list.
 */
export function parseState(output: string): EffectsState {
  const lines = output.split("\n");
  if (lines[0]?.trim() !== "running") return STOPPED;

  const presets: string[] = [];
  let inOutput = false;
  for (const line of lines.slice(3)) {
    if (/^Output presets:/.test(line)) {
      inOutput = true;
      continue;
    }
    if (!inOutput) continue;
    const match = /^\d+\t(.+)$/.exec(line);
    if (!match?.[1]) break;
    presets.push(match[1]);
  }

  return {
    running: true,
    bypassed: (lines[1] ?? "").trim() === "1",
    preset: (lines[2] ?? "").trim(),
    presets,
  };
}

/**
 * The preset a step lands on, wrapping at both ends. Nothing loaded counts as
 * "before the first" for a forward step and "after the last" backwards. One
 * preset (or none) has nowhere to go.
 */
export function stepPreset(
  presets: readonly string[],
  current: string,
  direction: 1 | -1,
): string | null {
  const count = presets.length;
  if (count < 2) return null;
  const index = presets.indexOf(current);
  if (index < 0) return presets[direction > 0 ? 0 : count - 1] ?? null;
  return presets[(index + direction + count) % count] ?? null;
}
