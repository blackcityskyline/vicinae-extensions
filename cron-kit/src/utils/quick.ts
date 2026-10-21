/**
 * A shorthand in front of the five fields.
 *
 * The schedule field takes cron syntax, which is precise and unreadable. This
 * turns the way a person says a schedule into the same five fields, and hands
 * the result to the ordinary field rather than writing anything itself: crontab
 * stays the only thing that decides whether the result is installable.
 *
 * Understood: `5m`, `every 5 minutes`, `2h`, `09:30`, `daily 09:30`,
 * `weekdays 09:30`, `weekly mon 09:30`, `monthly 1 09:30`, and the `@daily`
 * style aliases, which are passed through untouched.
 */

export type Quick = { ok: true; schedule: string } | { ok: false };

const DAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/** `9:30` -> `[9, 30]`, anything that is not a real time -> undefined. */
function time(value: string): [number, number] | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return [hour, minute];
}

function at(value: string): string | undefined {
  const parsed = time(value);
  return parsed ? `${parsed[1]} ${parsed[0]}` : undefined;
}

export function quickSchedule(input: string): Quick {
  const text = input.trim().toLowerCase();
  if (text === "") return { ok: false };

  if (/^@(hourly|daily|weekly|monthly|yearly|annually|midnight|reboot)$/.test(text)) {
    return { ok: true, schedule: text };
  }

  const bare = at(text);
  if (bare) return { ok: true, schedule: `${bare} * * *` };

  const everyMinutes = /^(?:every\s+)?(\d{1,2})\s*(?:m|min|mins|minute|minutes)$/.exec(text);
  if (everyMinutes) {
    const step = Number(everyMinutes[1]);
    if (step < 1 || step > 59) return { ok: false };
    return { ok: true, schedule: `*/${step} * * * *` };
  }

  const everyHours = /^(?:every\s+)?(\d{1,2})\s*(?:h|hr|hrs|hour|hours)$/.exec(text);
  if (everyHours) {
    const step = Number(everyHours[1]);
    if (step < 1 || step > 23) return { ok: false };
    return { ok: true, schedule: `0 */${step} * * *` };
  }

  const [kind, ...rest] = text.split(/\s+/).filter(Boolean);

  if (kind === "daily" || kind === "day") {
    if (rest.length === 0) return { ok: true, schedule: "0 0 * * *" };
    const moment = rest.length === 1 ? at(rest[0] ?? "") : undefined;
    return moment ? { ok: true, schedule: `${moment} * * *` } : { ok: false };
  }

  if (kind === "weekdays" || kind === "weekday") {
    if (rest.length === 0) return { ok: true, schedule: "0 0 * * 1-5" };
    const moment = rest.length === 1 ? at(rest[0] ?? "") : undefined;
    return moment ? { ok: true, schedule: `${moment} * * 1-5` } : { ok: false };
  }

  if (kind === "weekly" || kind === "week") {
    if (rest.length === 0) return { ok: true, schedule: "0 0 * * 1" };
    const day = DAYS[rest[0] ?? ""];
    if (day === undefined) return { ok: false };
    if (rest.length === 1) return { ok: true, schedule: `0 0 * * ${day}` };
    const moment = rest.length === 2 ? at(rest[1] ?? "") : undefined;
    return moment ? { ok: true, schedule: `${moment} * * ${day}` } : { ok: false };
  }

  if (kind === "monthly" || kind === "month") {
    if (rest.length === 0) return { ok: true, schedule: "0 0 1 * *" };
    if (rest.length === 1) {
      const moment = at(rest[0] ?? "");
      if (moment) return { ok: true, schedule: `${moment} 1 * *` };
      const dayOfMonth = Number(rest[0]);
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { ok: false };
      return { ok: true, schedule: `0 0 ${dayOfMonth} * *` };
    }
    if (rest.length === 2) {
      const dayOfMonth = Number(rest[0]);
      const moment = at(rest[1] ?? "");
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { ok: false };
      return moment ? { ok: true, schedule: `${moment} ${dayOfMonth} * *` } : { ok: false };
    }
  }

  return { ok: false };
}
