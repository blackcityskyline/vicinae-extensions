export type Schedule =
  | { mode: "clock"; hour: number; minute: number }
  | { mode: "relative"; seconds: number };

export type ParsedSchedule = { schedule?: Schedule; error?: string };

const DAY_SECONDS = 86_400;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600 };

/** "30" (minutes), "45m", "2h", "1h30m", "23:30". Errors are user-facing. */
export function parseSchedule(text: string): ParsedSchedule {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { error: "Enter a time: 30 (minutes), 45m, 2h, 1h30m, or a clock time like 23:30." };
  }

  if (trimmed.includes(":")) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    const hour = Number(match?.[1]);
    const minute = Number(match?.[2]);
    if (match === null || hour > 23 || minute > 59) {
      return { error: `${trimmed} is not a clock time: hours 00-23, minutes 00-59 with two digits.` };
    }
    return { schedule: { mode: "clock", hour, minute } };
  }

  const compact = trimmed.toLowerCase().replace(/\s+/g, "");

  if (/^\d+$/.test(compact)) {
    const minutes = Number(compact);
    if (minutes < 1 || minutes * 60 > DAY_SECONDS) {
      return { error: `${trimmed} minutes is not a timer: it must be between 1 minute and 24 hours.` };
    }
    return { schedule: { mode: "relative", seconds: minutes * 60 } };
  }

  if (/^(\d+[smh])+$/.test(compact)) {
    let seconds = 0;
    for (const match of compact.matchAll(/(\d+)([smh])/g)) {
      seconds += Number(match[1]) * (UNIT_SECONDS[match[2] ?? "s"] ?? 0);
    }
    if (seconds > DAY_SECONDS) {
      return { error: `${trimmed} is longer than the 24 hours a timer allows.` };
    }
    return { schedule: { mode: "relative", seconds } };
  }

  return { error: `could not read "${trimmed}". Use 30, 45m, 2h, 1h30m, or a clock time like 23:30.` };
}

/** Epoch milliseconds when a schedule comes due. A clock time already past lands tomorrow. */
export function dueAt(schedule: Schedule, now: number): number {
  if (schedule.mode === "relative") return now + schedule.seconds * 1000;
  const due = new Date(now);
  due.setHours(schedule.hour, schedule.minute, 0, 0);
  if (due.getTime() <= now) due.setDate(due.getDate() + 1);
  return due.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const mmss = `${Math.floor((total % 3600) / 60)}:${String(total % 60).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss.padStart(5, "0")}` : mmss;
}

export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
