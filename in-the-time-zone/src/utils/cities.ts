import { findFromCityStateProvince } from "city-timezones";

export type City = {
  /** `timeZone|city|latitude|longitude`, or `timeZone|city` for UTC. */
  id: string;
  city: string;
  zone: string;
  label: string;
  lat?: number;
  lng?: number;
};

type DatasetEntry = {
  city: string;
  province?: string;
  country: string;
  timezone: string;
  lat: number;
  lng: number;
  pop?: number;
};

/**
 * The dataset holds a San Francisco in Argentina, a London in Ontario and a
 * Tokyo suburb ahead of Tokyo itself, ordered alphabetically by country. Sorting
 * by population puts the city someone meant first.
 */
const SPECIAL: City[] = [{ id: "Etc/UTC|UTC", city: "UTC", zone: "Etc/UTC", label: "UTC (GMT+0)" }];

function label(entry: DatasetEntry): string {
  const place = entry.province && entry.province !== entry.city ? `${entry.province}, ` : "";
  return `${entry.city}, ${place}${entry.country}`;
}

export function searchCities(query: string, limit = 20): City[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const special = SPECIAL.filter((entry) => entry.label.toLowerCase().includes(trimmed) || entry.id.toLowerCase().includes(trimmed));

  const matches = (findFromCityStateProvince(query) as DatasetEntry[])
    .filter((entry) => entry.timezone)
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0) || a.city.localeCompare(b.city));

  const seen = new Set<string>();
  const cities: City[] = [];
  for (const entry of matches) {
    if (cities.length >= limit - special.length) break;

    const key = `${entry.timezone}|${entry.city}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cities.push({
      id: `${key}|${entry.lat}|${entry.lng}`,
      city: entry.city,
      zone: entry.timezone,
      label: label(entry),
      lat: entry.lat,
      lng: entry.lng,
    });
  }

  return [...special, ...cities];
}
