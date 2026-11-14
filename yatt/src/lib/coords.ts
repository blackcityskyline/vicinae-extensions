import { cityMapping } from "city-timezones";
import { fold } from "../core/text";

export type Coords = { lat: number; lng: number };

const cache = new Map<string, Coords | null>();

/**
 * Position of a place, for the sunrise and sunset column. The bundled dataset carries no coordinates and
 * no place is required to have them, so a miss is normal and renders as "—" rather than borrowing the
 * position of another city in the same zone.
 */
export function coordsOf(label: string, tz: string): Coords | undefined {
  const name = fold(label);
  const key = `${tz}|${name}`;
  const known = cache.get(key);
  if (known !== undefined) return known ?? undefined;

  let best: Coords | undefined;
  let pop = -1;
  for (const row of cityMapping) {
    if (row.timezone !== tz || row.pop <= pop) continue;
    if (fold(row.city) !== name && fold(row.city_ascii) !== name) continue;
    best = { lat: row.lat, lng: row.lng };
    pop = row.pop;
  }
  cache.set(key, best ?? null);
  return best;
}
