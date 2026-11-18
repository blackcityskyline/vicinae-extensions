import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSIONS,
  firstStartsFrom,
  parseSessions,
  serializeSessions,
  spansBetween,
  type SessionDef,
} from "../src/lib/sessions";

const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);
const day = (y: number, m: number, d: number): [number, number] => [utc(y, m, d), utc(y, m, d + 1)];

const def = (over: Partial<SessionDef> = {}): SessionDef => ({
  name: "X",
  timezone: "UTC",
  start: { h: 9, m: 0 },
  days: [1, 2, 3, 4, 5],
  color: "#112233",
  ...over,
});

describe("session file", () => {
  it("reads names, zones, times, colours and days", () => {
    const text = JSON.stringify({
      sessions: [
        { name: "Mine", timezone: "Asia/Tokyo", start: "09:00", end: "11:30", color: "#abc", days: ["mon", "wed"] },
        { name: "Open", timezone: "Europe/London", start: "8:05", color: "#A1B2C3" },
      ],
    });
    expect(parseSessions(text)).toEqual({
      sessions: [
        { name: "Mine", timezone: "Asia/Tokyo", start: { h: 9, m: 0 }, end: { h: 11, m: 30 }, color: "#abc", days: [1, 3] },
        { name: "Open", timezone: "Europe/London", start: { h: 8, m: 5 }, color: "#A1B2C3", days: [1, 2, 3, 4, 5] },
      ],
    });
  });

  it("writes the defaults in a form that reads back as the same defaults", () => {
    expect(parseSessions(serializeSessions(DEFAULT_SESSIONS))).toEqual({ sessions: DEFAULT_SESSIONS });
  });

  it.each([
    ["not json", "{", /not valid JSON/],
    ["no list", "{}", /"sessions" must be a list/],
    ["empty list", '{"sessions":[]}', /at least one session/],
    ["no name", '{"sessions":[{"timezone":"UTC","start":"09:00","color":"#fff"}]}', /session 1: "name"/],
    ["blank name", '{"sessions":[{"name":" ","timezone":"UTC","start":"09:00","color":"#fff"}]}', /session 1: "name"/],
    ["bad zone", '{"sessions":[{"name":"A","timezone":"Mars/Base","start":"09:00","color":"#fff"}]}', /session 1: .*Mars\/Base/],
    ["bad start", '{"sessions":[{"name":"A","timezone":"UTC","start":"25:00","color":"#fff"}]}', /session 1: "start"/],
    ["bad minutes", '{"sessions":[{"name":"A","timezone":"UTC","start":"09:60","color":"#fff"}]}', /session 1: "start"/],
    ["bad end", '{"sessions":[{"name":"A","timezone":"UTC","start":"09:00","end":"noon","color":"#fff"}]}', /session 1: "end"/],
    ["bad colour", '{"sessions":[{"name":"A","timezone":"UTC","start":"09:00","color":"red"}]}', /session 1: "color"/],
    ["bad day", '{"sessions":[{"name":"A","timezone":"UTC","start":"09:00","color":"#fff","days":["funday"]}]}', /session 1: "days"/],
    ["empty days", '{"sessions":[{"name":"A","timezone":"UTC","start":"09:00","color":"#fff","days":[]}]}', /session 1: "days"/],
  ])("rejects %s with a message that names the session", (_label, text, message) => {
    const result = parseSessions(text);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(message);
  });
});

describe("defaults", () => {
  const byName = (spans: ReturnType<typeof spansBetween>, label: string) => spans.filter((s) => s.label === label);

  it("carry the wanted labels in order", () => {
    expect(DEFAULT_SESSIONS.map((s) => s.name)).toEqual([
      "Asia",
      "Frankfurt",
      "London",
      "Lunch",
      "US",
      "AM",
      "Lunch",
      "PM",
    ]);
  });

  it("follow each market's own clock through winter, and a week when only the US has moved its clocks", () => {
    // 15 January: no daylight saving anywhere. London 08:00 is 08:00 UTC, Frankfurt 08:00 CET is 07:00 UTC.
    const jan = spansBetween(DEFAULT_SESSIONS, ...day(2026, 1, 15));
    expect(byName(jan, "Asia")[0]?.at).toBe(utc(2026, 1, 15, 0, 0));
    expect(byName(jan, "Frankfurt")[0]?.at).toBe(utc(2026, 1, 15, 7, 0));
    expect(byName(jan, "London")[0]?.at).toBe(utc(2026, 1, 15, 8, 0));
    // London's lunch, 12:00-14:00 local, is 07:00-09:00 in New York.
    expect(byName(jan, "Lunch")[0]).toMatchObject({ at: utc(2026, 1, 15, 12, 0), end: utc(2026, 1, 15, 14, 0) });
    expect(byName(jan, "US")[0]).toMatchObject({ at: utc(2026, 1, 15, 12, 0), end: utc(2026, 1, 15, 14, 30) });
    expect(byName(jan, "AM")[0]).toMatchObject({ at: utc(2026, 1, 15, 14, 30), end: utc(2026, 1, 15, 17, 0) });
    expect(byName(jan, "PM")[0]).toMatchObject({ at: utc(2026, 1, 15, 18, 0), end: utc(2026, 1, 15, 21, 0) });
    // 18 March: the US is on summer time since 8 March, Europe and the UK only change on 29 March.
    const mar = spansBetween(DEFAULT_SESSIONS, ...day(2026, 3, 18));
    expect(byName(mar, "London")[0]?.at).toBe(utc(2026, 3, 18, 8, 0));
    // Only the US has moved: the same London hours are now 08:00-10:00 in New York.
    expect(byName(mar, "Lunch")[0]).toMatchObject({ at: utc(2026, 3, 18, 12, 0), end: utc(2026, 3, 18, 14, 0) });
    expect(byName(mar, "AM")[0]?.at).toBe(utc(2026, 3, 18, 13, 30));
    expect(byName(mar, "PM")[0]).toMatchObject({ at: utc(2026, 3, 18, 17, 0), end: utc(2026, 3, 18, 20, 0) });
    // 16 July: everyone on summer time except Tokyo, which has none.
    const jul = spansBetween(DEFAULT_SESSIONS, ...day(2026, 7, 16));
    expect(byName(jul, "Asia")[0]?.at).toBe(utc(2026, 7, 16, 0, 0));
    expect(byName(jul, "Frankfurt")[0]?.at).toBe(utc(2026, 7, 16, 6, 0));
    expect(byName(jul, "London")[0]?.at).toBe(utc(2026, 7, 16, 7, 0));
    expect(byName(jul, "AM")[0]?.at).toBe(utc(2026, 7, 16, 13, 30));
  });

  it("skip weekends", () => {
    expect(spansBetween(DEFAULT_SESSIONS, ...day(2026, 1, 17))).toEqual([]);
  });
});

describe("spans", () => {
  it("keep a window that began before the visible range and one that ends after it", () => {
    const sessions = [def({ start: { h: 9, m: 0 }, end: { h: 17, m: 0 } })];
    const spans = spansBetween(sessions, utc(2026, 1, 15, 12, 0), utc(2026, 1, 16, 12, 0));
    expect(spans.map((s) => [s.at, s.end])).toEqual([
      [utc(2026, 1, 15, 9, 0), utc(2026, 1, 15, 17, 0)],
      [utc(2026, 1, 16, 9, 0), utc(2026, 1, 16, 17, 0)],
    ]);
  });

  it("end on the next day when the end is not after the start, and still show last night's tail", () => {
    const sessions = [def({ start: { h: 22, m: 0 }, end: { h: 2, m: 0 } })];
    const spans = spansBetween(sessions, utc(2026, 1, 15), utc(2026, 1, 16));
    expect(spans.map((s) => [s.at, s.end])).toEqual([
      [utc(2026, 1, 14, 22, 0), utc(2026, 1, 15, 2, 0)],
      [utc(2026, 1, 15, 22, 0), utc(2026, 1, 16, 2, 0)],
    ]);
  });

  it("have no end for a session that is only an open", () => {
    const [span] = spansBetween([def()], utc(2026, 1, 15), utc(2026, 1, 16));
    expect(span).toEqual({ label: "X", color: "#112233", at: utc(2026, 1, 15, 9, 0) });
  });
});

describe("start times read in New York", () => {
  it("shift when the clocks do, because each session keeps its own local time", () => {
    const nyTime = (instant: number) => {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(instant);
    };
    const times = (from: number) =>
      Object.fromEntries(firstStartsFrom(DEFAULT_SESSIONS, from).map((s) => [s.label, nyTime(s.at)]));
    // January, all on winter time: London 08:00 GMT is 03:00 in New York, Frankfurt 02:00, Tokyo 19:00 the evening before.
    expect(times(utc(2026, 1, 15))).toMatchObject({
      Asia: "19:00",
      Frankfurt: "02:00",
      London: "03:00",
      AM: "09:30",
      PM: "13:00",
    });
    // 18 March, New York on summer time and Europe not yet: every European open is an hour earlier there.
    expect(times(utc(2026, 3, 18))).toMatchObject({
      Asia: "20:00",
      Frankfurt: "03:00",
      London: "04:00",
      AM: "09:30",
      PM: "13:00",
    });
    // 16 July, everyone on summer time: back to the January gaps, only Tokyo has stayed put.
    expect(times(utc(2026, 7, 16))).toMatchObject({ Asia: "20:00", Frankfurt: "02:00", London: "03:00" });
  });
});
