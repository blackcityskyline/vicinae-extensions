/**
 * Regular market hours, as local wall-clock times in each market's own zone. The schedule is the constant; the
 * daylight-saving rules come from `core/time`'s IANA-backed conversion, so the same 09:30 opens at 14:30 UTC in
 * January and 13:30 UTC in July.
 */
import { addDays, startOfDay, wallParts, wallToInstant } from "../core/time";

export type SessionTime = { h: number; m: number };

export type Interval = { start: number; end: number };

export type Session = {
  id: string;
  label: string;
  tz: string;
  open: SessionTime;
  close: SessionTime;
  /** Intraday pauses, local to the open's own day. */
  breaks?: { start: SessionTime; end: SessionTime }[];
  /** Days the session opens on, 0 = Sunday … 6 = Saturday. An overnight session belongs to the day it opens. */
  days: number[];
  /** The close falls on the next local day (CME Globex). */
  overnight?: boolean;
  /** Names this session's open on the timeline. A session without one is not marked. */
  marker?: string;
};

/**
 * Cash exchanges first, then the forex sessions that run around them. Frankfurt is the forex-desk session
 * (08:00–16:00 local, as brokers list it), not the Xetra cash open at 09:00: it starts an hour before London all
 * year, because Europe and the UK change their clocks on the same day. The Tokyo exchange and the London forex
 * session open with the Asian session and the London exchange, so they carry no marker of their own.
 */
export const SESSIONS: Session[] = [
  {
    id: "tokyo-exchange",
    label: "Tokyo Stock Exchange",
    tz: "Asia/Tokyo",
    open: { h: 9, m: 0 },
    close: { h: 15, m: 30 },
    breaks: [{ start: { h: 11, m: 30 }, end: { h: 12, m: 30 } }],
    days: [1, 2, 3, 4, 5],
  },
  {
    id: "frankfurt-open",
    label: "Frankfurt",
    tz: "Europe/Berlin",
    open: { h: 8, m: 0 },
    close: { h: 16, m: 0 },
    days: [1, 2, 3, 4, 5],
    marker: "Frankfurt",
  },
  {
    id: "london-open",
    label: "London Stock Exchange",
    tz: "Europe/London",
    open: { h: 8, m: 0 },
    close: { h: 16, m: 30 },
    days: [1, 2, 3, 4, 5],
    marker: "London",
  },
  {
    id: "nyse-open",
    label: "NYSE",
    tz: "America/New_York",
    open: { h: 9, m: 30 },
    close: { h: 16, m: 0 },
    days: [1, 2, 3, 4, 5],
    marker: "NYSE",
  },
  {
    // Sunday 17:00 to Friday 16:00 Chicago time, a daily break from 16:00 to 17:00. The sessions open Sunday to
    // Thursday evening; Friday's evening open does not exist.
    id: "cme-open",
    label: "CME Globex",
    tz: "America/Chicago",
    open: { h: 17, m: 0 },
    close: { h: 16, m: 0 },
    days: [0, 1, 2, 3, 4],
    overnight: true,
    marker: "CME",
  },
  {
    id: "asian-session",
    label: "Asian session",
    tz: "Asia/Tokyo",
    open: { h: 9, m: 0 },
    close: { h: 18, m: 0 },
    days: [1, 2, 3, 4, 5],
    marker: "Asia",
  },
  {
    id: "london-session",
    label: "London session",
    tz: "Europe/London",
    open: { h: 8, m: 0 },
    close: { h: 17, m: 0 },
    days: [1, 2, 3, 4, 5],
  },
  {
    id: "new-york-session",
    label: "New York session",
    tz: "America/New_York",
    open: { h: 8, m: 0 },
    close: { h: 17, m: 0 },
    days: [1, 2, 3, 4, 5],
    marker: "New York",
  },
];

export function sessionById(id: string): Session {
  const s = SESSIONS.find((x) => x.id === id);
  if (!s) throw new Error(`no session ${id}`);
  return s;
}

export type SessionOpen = { start: number; close: number; breaks: Interval[] };

/** The session that the given local calendar date belongs to, in instants. */
export function openInstant(s: Session, y: number, m: number, d: number): SessionOpen {
  return {
    start: wallToInstant(s.tz, y, m, d, s.open.h, s.open.m),
    close: wallToInstant(s.tz, y, m, d + (s.overnight ? 1 : 0), s.close.h, s.close.m),
    breaks: (s.breaks ?? []).map((b) => ({
      start: wallToInstant(s.tz, y, m, d, b.start.h, b.start.m),
      end: wallToInstant(s.tz, y, m, d, b.end.h, b.end.m),
    })),
  };
}

/** The session of the market's own current local date, when that date trades. */
export function sessionOn(s: Session, instant: number): SessionOpen | undefined {
  const p = wallParts(instant, s.tz);
  if (!s.days.includes(p.weekday)) return undefined;
  return openInstant(s, p.y, p.m, p.d);
}

function inside(o: SessionOpen, instant: number): boolean {
  if (instant < o.start || instant >= o.close) return false;
  return !o.breaks.some((b) => instant >= b.start && instant < b.end);
}

/** True while the market's regular session is running, breaks and weekends included. */
export function isOpenAt(s: Session, instant: number): boolean {
  const today = sessionOn(s, instant);
  if (today && inside(today, instant)) return true;
  if (s.overnight) {
    // A session opened yesterday is still running into today.
    const previous = addDays(startOfDay(instant, s.tz), s.tz, -1);
    const p = wallParts(previous, s.tz);
    if (s.days.includes(p.weekday)) {
      const yesterday = openInstant(s, p.y, p.m, p.d);
      if (inside(yesterday, instant)) return true;
    }
  }
  return false;
}

/** The first open strictly after `instant`. */
export function nextOpen(s: Session, instant: number): SessionOpen {
  let day = startOfDay(instant, s.tz);
  for (let i = 0; i < 8; i++) {
    const p = wallParts(day, s.tz);
    if (s.days.includes(p.weekday)) {
      const open = openInstant(s, p.y, p.m, p.d);
      if (open.start > instant) return open;
    }
    day = addDays(day, s.tz, 1);
  }
  throw new Error(`${s.label} has no open within a week`);
}

export type SessionState = {
  /** The session now running, or the next one to open. */
  open: SessionOpen;
  /** The session that started today in the market's zone, when it has not opened yet. */
  today?: SessionOpen;
  isOpen: boolean;
};

export function sessionState(s: Session, now: number): SessionState {
  const today = sessionOn(s, now);
  if (today && inside(today, now)) return { open: today, today, isOpen: true };
  if (s.overnight) {
    const previous = addDays(startOfDay(now, s.tz), s.tz, -1);
    const p = wallParts(previous, s.tz);
    if (s.days.includes(p.weekday)) {
      const yesterday = openInstant(s, p.y, p.m, p.d);
      if (inside(yesterday, now)) return { open: yesterday, isOpen: true };
    }
  }
  return { open: nextOpen(s, now), today, isOpen: false };
}

/** The open stretches of a session that overlap `[from, to)`, with the mid-session breaks cut out. */
export function sessionWindows(s: Session, from: number, to: number): Interval[] {
  const out: Interval[] = [];
  let day = addDays(startOfDay(from, s.tz), s.tz, -1);
  for (let i = 0; i < 8 && day < to + 86_400_000; i++) {
    const p = wallParts(day, s.tz);
    if (s.days.includes(p.weekday)) {
      const o = openInstant(s, p.y, p.m, p.d);
      if (o.close > from && o.start < to) {
        let cursor = Math.max(o.start, from);
        const end = Math.min(o.close, to);
        for (const b of o.breaks) {
          if (b.end <= cursor || b.start >= end) continue;
          if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, end) });
          cursor = Math.max(cursor, b.end);
        }
        if (cursor < end) out.push({ start: cursor, end });
      }
    }
    day = addDays(day, s.tz, 1);
  }
  return out;
}

/** The market a location's own timezone trades: the cash exchange, and the forex session around it. */
export type Region = { market: Session; session: Session };

const US_ZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
]);

const EUROPE_ZONES = new Set([
  "UTC",
  "Etc/UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Berlin",
  "Europe/Frankfurt",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Milan",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Budapest",
  "Europe/Athens",
]);

/** Zones with a cash market this extension knows; other zones get no market shading rather than a guess. */
export function regionFor(tz: string): Region | undefined {
  if (tz === "Asia/Tokyo") return { market: sessionById("tokyo-exchange"), session: sessionById("asian-session") };
  if (tz === "Europe/London" || tz === "Europe/Dublin" || tz === "UTC" || tz === "Etc/UTC") {
    return { market: sessionById("london-open"), session: sessionById("london-session") };
  }
  if (EUROPE_ZONES.has(tz)) return { market: sessionById("frankfurt-open"), session: sessionById("london-session") };
  if (US_ZONES.has(tz)) return { market: sessionById("nyse-open"), session: sessionById("new-york-session") };
  return undefined;
}

/**
 * The marked opens falling in `[from, to)`, one entry per session in time order. Opens in the same minute keep
 * their `SESSIONS` order and stay separate, so each market can be named.
 */
export function markersBetween(from: number, to: number): { at: number; label: string }[] {
  return SESSIONS.flatMap((s) => (s.marker ? [{ at: nextOpen(s, from - 1).start, label: s.marker }] : []))
    .filter((marker) => marker.at < to)
    .sort((a, b) => a.at - b.at);
}
