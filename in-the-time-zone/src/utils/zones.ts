/**
 * A zone is one string: `timeZone|city|latitude|longitude`.
 *
 * The coordinates are part of the id on purpose. Upstream stores
 * `timeZone|city` and looks the city up again to get its position, falling back
 * to the first city in the zone when the pair misses — which is Wallace, Idaho
 * for America/Los_Angeles, so the sunrise and sunset belong to the wrong place.
 * Carrying the coordinates makes the lookup impossible to get wrong, and keeps a
 * saved id valid if the dataset changes underneath it.
 */

export type ParsedZone = {
  zone: string;
  city: string;
  lat?: number;
  lng?: number;
};

export function parseZone(id: string): ParsedZone {
  const [zone = "", city = "", lat, lng] = id.split("|");

  const hasCoordinates = lat !== undefined && lng !== undefined && lat !== "" && lng !== "";
  if (!hasCoordinates) return { zone, city };

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { zone, city };

  return { zone, city, lat: latitude, lng: longitude };
}

export function zoneOf(id: string): string {
  return parseZone(id).zone;
}

export function cityOf(id: string): string {
  return parseZone(id).city;
}

/** Absent rather than zero: UTC is a zone with no place, so it has no sunrise. */
export function coordsOf(id: string): { lat?: number; lng?: number } {
  const { lat, lng } = parseZone(id);
  return { lat, lng };
}

/**
 * Coordinates copied out of `city-timezones` so the first run already has a
 * sunrise column. `test/zones.test.ts` fails if the dataset ever disagrees.
 */
export const DEFAULT_ZONES: string[] = [
  "America/Los_Angeles|San Francisco|37.74000775|-122.4599777",
  "America/New_York|New York|40.74997906|-73.98001693",
  "Europe/London|London|51.49999473|-0.116721844",
  "Europe/Paris|Paris|48.86669293|2.333335326",
  "Asia/Kuala_Lumpur|Kuala Lumpur|3.166665872|101.6999833",
  "Asia/Tokyo|Tokyo|35.68501691|139.7514074",
];
