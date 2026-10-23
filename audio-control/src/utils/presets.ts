import type { OutputGroup } from "./outputGroups";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type OutputPreset = {
  name: string;
  members: string[];
  volumePercent: number;
};

export type PresetPlan =
  | { kind: "existing-group"; group: OutputGroup }
  | { kind: "create-group"; members: string[] }
  | { kind: "single"; sinkName: string }
  | { kind: "missing"; missing: string[] };

function normalizePreset(value: unknown): OutputPreset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;

  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return undefined;
  if (!Array.isArray(item.members)) return undefined;
  if (typeof item.volumePercent !== "number" || !Number.isFinite(item.volumePercent)) {
    return undefined;
  }

  const members: string[] = [];
  for (const member of item.members) {
    if (typeof member !== "string") continue;
    const trimmed = member.trim();
    if (trimmed && !members.includes(trimmed)) members.push(trimmed);
  }
  if (members.length === 0) return undefined;

  return {
    name,
    members,
    volumePercent: Math.round(clamp(item.volumePercent, 0, 150)),
  };
}

export function parsePresets(raw: string | null | undefined): OutputPreset[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const presets: OutputPreset[] = [];
  const names = new Set<string>();
  for (const value of parsed) {
    const preset = normalizePreset(value);
    if (!preset) continue;
    const key = preset.name.toLowerCase();
    if (names.has(key)) continue;
    names.add(key);
    presets.push(preset);
  }
  return presets;
}

export function serializePresets(presets: OutputPreset[]): string {
  return JSON.stringify(presets);
}

export function upsertPreset(
  presets: OutputPreset[],
  preset: OutputPreset,
): OutputPreset[] {
  const key = preset.name.toLowerCase();
  return [
    preset,
    ...presets.filter((candidate) => candidate.name.toLowerCase() !== key),
  ];
}

export function removePreset(
  presets: OutputPreset[],
  name: string,
): OutputPreset[] {
  const key = name.toLowerCase();
  return presets.filter((candidate) => candidate.name.toLowerCase() !== key);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const members = new Set(left);
  return right.every((member) => members.has(member));
}

export function planPresetApplication(
  preset: OutputPreset,
  sinks: readonly { name: string }[],
  groups: readonly OutputGroup[],
): PresetPlan {
  const existingNames = new Set(sinks.map((sink) => sink.name));
  const missing = preset.members.filter((member) => !existingNames.has(member));
  if (missing.length > 0) return { kind: "missing", missing };

  const onlyMember = preset.members[0];
  if (preset.members.length === 1 && onlyMember) {
    return { kind: "single", sinkName: onlyMember };
  }

  const group = groups.find(
    (candidate) =>
      existingNames.has(candidate.sinkName) &&
      sameMembers(candidate.members, preset.members),
  );
  if (group) return { kind: "existing-group", group };

  return { kind: "create-group", members: [...preset.members] };
}
