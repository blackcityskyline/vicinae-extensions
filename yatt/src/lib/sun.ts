import { getTimes } from "suncalc";
import { formatTime, type TimeFormat } from "../core/format";
import type { Coords } from "./coords";

export type SunPair = { sunrise: string; sunset: string };

/** No place, no sun: a custom location without coordinates, or a pole in the wrong season. */
const UNKNOWN = "—";

/** Sunrise and sunset for a place, read in that place's own zone at the noon of its own date. */
export function sunTimes(coords: Coords | undefined, at: number, tz: string, fmt: TimeFormat): SunPair {
  if (!coords) return { sunrise: UNKNOWN, sunset: UNKNOWN };
  const times = getTimes(new Date(at), coords.lat, coords.lng);
  return { sunrise: valid(times.sunrise, tz, fmt), sunset: valid(times.sunset, tz, fmt) };
}

function valid(at: Date | undefined, tz: string, fmt: TimeFormat): string {
  if (!at || Number.isNaN(at.getTime())) return UNKNOWN;
  return formatTime(at.getTime(), tz, fmt);
}
