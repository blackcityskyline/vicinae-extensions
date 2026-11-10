export interface ProfileEntry {
  name: string;
  /** Last write to that profile's `History` file. */
  historyMtimeMs: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * The profile a `--app` window opens in, which is also the one worth reading
 * suggestions from. Current builds no longer write `last_used` (measured on
 * Helium and Brave: only `info_cache`, `last_active_profiles`, `profiles_order`),
 * so the fallbacks are the active list and then the most recently written
 * history.
 */
export function pickProfile(localState: unknown, profiles: readonly ProfileEntry[]): string {
  const names = new Set(profiles.map((entry) => entry.name));
  const profile = asRecord(asRecord(localState)?.["profile"]);

  const lastUsed = profile?.["last_used"];
  if (typeof lastUsed === "string" && names.has(lastUsed)) return lastUsed;

  const active = stringList(profile?.["last_active_profiles"]).find((name) => names.has(name));
  if (active !== undefined) return active;

  const newest = [...profiles].sort((a, b) => b.historyMtimeMs - a.historyMtimeMs)[0];
  return newest?.name ?? "Default";
}
