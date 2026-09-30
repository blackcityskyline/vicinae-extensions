import { getTimes } from "suncalc";

import { zoneClock } from "~/utils/time";

export type SunTimes = {
  sunrise: string;
  sunset: string;
};

/** No place, no sun: UTC and the poles in the wrong season both land here. */
const UNKNOWN = "—";

/**
 * Sunrise and sunset for a place, read in that place's own zone. Checked against
 * the upstream screenshots at San Francisco, Paris and New York, all within a
 * couple of minutes.
 */
export function sunTimes(lat: number | undefined, lng: number | undefined, at: Date, zone: string): SunTimes {
  if (lat === undefined || lng === undefined) return { sunrise: UNKNOWN, sunset: UNKNOWN };

  const times = getTimes(at, lat, lng);

  return {
    sunrise: valid(times.sunrise, zone),
    sunset: valid(times.sunset, zone),
  };
}

function valid(at: Date | undefined, zone: string): string {
  if (!at || Number.isNaN(at.getTime())) return UNKNOWN;
  return zoneClock(zone, at);
}
