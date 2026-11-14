import { isValidZone } from "./time";
import type { Location } from "./types";

/**
 * The `zones` list of the retired `in-the-time-zone` extension: `timeZone|city|lat|lng`
 * ids in JSON, or a bare zone id for the local row. Kept so a saved list survives the merge.
 */
export function mergeLegacyZones(rawIds: string | undefined, base: string | undefined, existing: Location[]): Location[] {
  if (!rawIds) return [];
  let ids: unknown;
  try {
    ids = JSON.parse(rawIds);
  } catch {
    return [];
  }
  if (!Array.isArray(ids)) return [];

  const candidates = [...ids, ...(typeof base === "string" && !ids.includes(base) ? [base] : [])];
  const seen = new Set(existing.map((l) => `${l.tz}|${l.label.toLowerCase()}`));
  const out: Location[] = [];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const [tz = "", city] = raw.split("|");
    if (!isValidZone(tz)) continue;
    const label = city?.trim() || (tz.split("/").pop() ?? tz).replace(/_/g, " ");
    const key = `${tz}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `legacy:${raw}`,
      kind: "city",
      label,
      tz,
      aliases: [],
      ...(raw === base ? { isHome: true } : {}),
    });
  }
  return out;
}
