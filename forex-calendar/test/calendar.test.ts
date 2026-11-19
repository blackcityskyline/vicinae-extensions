import assert from "node:assert/strict";

// Day boundaries depend on the machine's zone, so the checks pin one before any Date is read.
process.env.TZ = "Europe/Moscow";

import { readFileSync } from "node:fs";

import { parseFeed } from "../src/api/feed.ts";
import { mergeEvents, monthUrl, parseMonthPage, shiftMonth, uncoveredSides } from "../src/api/ff-month.ts";
import { describeFilters, isFiltered, NO_FILTERS, parseFilters } from "../src/utils/filters.ts";
import { feedWeekOf, groupByDay, monthsOf, periodBounds, selectEvents, sourceOf } from "../src/utils/select.ts";

/**
 * The self-check.
 *
 * The feed shape was read from https://nfs.faireconomy.media/ff_calendar_thisweek.json on
 * 2026-11-15: a JSON array of {title, country, date, impact, forecast, previous}, `date` an ISO 8601
 * string with a UTC offset, `impact` one of Low, Medium, High, Holiday. Expected instants below are
 * worked out by hand from the offsets, not recomputed by the code under test.
 */

const BODY = JSON.stringify([
  { title: "RBA Assist Gov Hunter Speaks", country: "AUD", date: "2026-11-08T17:30:00-05:00", impact: "Low", forecast: "", previous: "" },
  { title: "CPI y\/y", country: "CNY", date: "2026-11-08T20:30:00-05:00", impact: "Low", forecast: "0.8%", previous: "0.9%" },
  { title: "Core CPI m\/m", country: "USD", date: "2026-11-10T08:30:00-05:00", impact: "High", forecast: "0.3%", previous: "0.2%" },
  { title: "Bank Holiday", country: "All", date: "2026-11-11T00:00:00-05:00", impact: "Holiday", forecast: "", previous: "" },
  { title: "FOMC Member Speaks", country: "USD", date: "2026-11-11T13:00:00-05:00", impact: "Medium", forecast: "", previous: "" },
]);

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

const events = parseFeed(BODY);
const titles = (list: typeof events) => list.map((event) => event.title);

check("parseFeed turns a -05:00 offset into the right instant", () => {
  // 17:30 at UTC-5 is 22:30 UTC.
  assert.equal(new Date(events[0]!.at).toISOString(), "2026-11-08T22:30:00.000Z");
});

check("parseFeed keeps the feed's own fields and unescapes the slash", () => {
  assert.equal(events[1]!.title, "CPI y/y");
  assert.equal(events[1]!.currency, "CNY");
  assert.equal(events[1]!.forecast, "0.8%");
  assert.equal(events[1]!.previous, "0.9%");
  assert.equal(events[2]!.impact, "High");
});

check("parseFeed says what came back when the body is not JSON", () => {
  assert.throws(() => parseFeed("<html>Performing security verification</html>"), /not JSON/);
});

check("parseFeed refuses a JSON body that is not the feed", () => {
  assert.throws(() => parseFeed('{"error":"rate limited"}'), /unexpected/);
  assert.throws(() => parseFeed('[{"title":"x"}]'), /unexpected/);
});

check("parseFeed accepts an empty week", () => {
  assert.deepEqual(parseFeed("[]"), []);
});

check("parseFeed sorts by time", () => {
  const shuffled = JSON.stringify(JSON.parse(BODY).reverse());
  assert.deepEqual(titles(parseFeed(shuffled)), titles(events));
});

check("today runs from local midnight to the next one", () => {
  // Moscow is UTC+3 all year: 2026-11-10 00:00 local is 2026-11-09T21:00Z.
  const [from, to] = periodBounds("today", new Date("2026-11-10T12:00:00+03:00"));
  assert.equal(new Date(from).toISOString(), "2026-11-09T21:00:00.000Z");
  assert.equal(new Date(to).toISOString(), "2026-11-10T21:00:00.000Z");
});

check("a Sunday-evening New York event is Monday in Moscow", () => {
  // 2026-11-08T22:30Z is 2026-11-09 01:30 at UTC+3.
  const monday = selectEvents(events, { period: "today", now: new Date("2026-11-09T09:00:00+03:00"), filters: NO_FILTERS });
  assert.deepEqual(titles(monday), ["RBA Assist Gov Hunter Speaks", "CPI y/y"]);
  const sunday = selectEvents(events, { period: "today", now: new Date("2026-11-08T09:00:00+03:00"), filters: NO_FILTERS });
  assert.deepEqual(titles(sunday), []);
});

check("a day that ends daylight saving time is 25 hours long", () => {
  process.env.TZ = "America/New_York";
  try {
    // 2026-11-01: midnight is still UTC-4 (04:00Z), the next midnight is UTC-5 (05:00Z the day after).
    const [from, to] = periodBounds("today", new Date("2026-11-01T12:00:00-05:00"));
    assert.equal(new Date(from).toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(new Date(to).toISOString(), "2026-11-02T05:00:00.000Z");
  } finally {
    process.env.TZ = "Europe/Moscow";
  }
});

check("tomorrow and yesterday are the neighbouring days", () => {
  const now = new Date("2026-11-10T12:00:00+03:00");
  const [tomorrowFrom, tomorrowTo] = periodBounds("tomorrow", now);
  assert.equal(new Date(tomorrowFrom).toISOString(), "2026-11-10T21:00:00.000Z");
  assert.equal(new Date(tomorrowTo).toISOString(), "2026-11-11T21:00:00.000Z");
  const [yesterdayFrom, yesterdayTo] = periodBounds("yesterday", now);
  assert.equal(new Date(yesterdayFrom).toISOString(), "2026-11-08T21:00:00.000Z");
  assert.equal(new Date(yesterdayTo).toISOString(), "2026-11-09T21:00:00.000Z");
});

check("upcoming drops what has already happened", () => {
  const now = new Date("2026-11-10T20:00:00+03:00"); // 12:00 in New York: after the 08:30 CPI
  const upcoming = selectEvents(events, { period: "upcoming", now, filters: NO_FILTERS });
  assert.deepEqual(titles(upcoming), ["Bank Holiday", "FOMC Member Speaks"]);
});

check("the week keeps everything", () => {
  const all = selectEvents(events, { period: "week", now: new Date("2026-11-10T12:00:00+03:00"), filters: NO_FILTERS });
  assert.equal(all.length, 5);
});

check("an impact set keeps exactly those levels, so grey and yellow can be dropped", () => {
  const base = { period: "week" as const, now: new Date("2026-11-10T12:00:00+03:00") };
  const only = (impacts: Array<"High" | "Medium" | "Low" | "Holiday">) =>
    titles(selectEvents(events, { ...base, filters: { impacts, currencies: [] } }));
  assert.deepEqual(only(["High"]), ["Core CPI m/m"]);
  assert.deepEqual(only(["High", "Medium"]), ["Core CPI m/m", "FOMC Member Speaks"]);
  assert.deepEqual(only(["Low", "Holiday"]), ["RBA Assist Gov Hunter Speaks", "CPI y/y", "Bank Holiday"]);
  assert.equal(only([]).length, 5);
});

check("several currencies can be kept at once, and global events always stay", () => {
  const base = { period: "week" as const, now: new Date("2026-11-10T12:00:00+03:00") };
  const kept = (currencies: string[]) => titles(selectEvents(events, { ...base, filters: { impacts: [], currencies } }));
  assert.deepEqual(kept(["USD"]), ["Core CPI m/m", "Bank Holiday", "FOMC Member Speaks"]);
  assert.deepEqual(kept(["AUD", "CNY"]), ["RBA Assist Gov Hunter Speaks", "CPI y/y", "Bank Holiday"]);
  assert.deepEqual(kept(["EUR"]), ["Bank Holiday"]);
});

check("impact and currency filters combine", () => {
  const filtered = selectEvents(events, {
    period: "week",
    now: new Date("2026-11-10T12:00:00+03:00"),
    filters: { impacts: ["High", "Medium"], currencies: ["USD"] },
  });
  assert.deepEqual(titles(filtered), ["Core CPI m/m", "FOMC Member Speaks"]);
});

check("next week reads the next week's feed and keeps all of it", () => {
  assert.equal(feedWeekOf("nextweek"), "nextweek");
  for (const period of ["today", "tomorrow", "yesterday", "upcoming", "week"] as const) {
    assert.equal(feedWeekOf(period), "thisweek");
  }
  const all = selectEvents(events, { period: "nextweek", now: new Date("2026-11-10T12:00:00+03:00"), filters: NO_FILTERS });
  assert.equal(all.length, 5);
});

check("parseFilters restores what was saved, in the feed's spelling", () => {
  const saved = '{"currencies":["usd","EUR","usd"],"impacts":["High","Medium"]}';
  assert.deepEqual(parseFilters(saved), { currencies: ["USD", "EUR"], impacts: ["High", "Medium"] });
});

check("parseFilters ignores anything that is not a saved filter", () => {
  assert.deepEqual(parseFilters(undefined), NO_FILTERS);
  assert.deepEqual(parseFilters("not json"), NO_FILTERS);
  assert.deepEqual(parseFilters('{"currencies":"USD","impacts":7}'), NO_FILTERS);
  assert.deepEqual(parseFilters('{"currencies":["USD",3],"impacts":["Huge","Low"]}'), { currencies: ["USD"], impacts: ["Low"] });
});

check("isFiltered and describeFilters say what is active", () => {
  assert.equal(isFiltered(NO_FILTERS), false);
  assert.equal(isFiltered({ currencies: ["USD"], impacts: [] }), true);
  assert.equal(describeFilters({ currencies: ["USD", "EUR"], impacts: ["High", "Medium"] }), "High, Medium · USD, EUR");
  assert.equal(describeFilters({ currencies: [], impacts: ["High"] }), "High");
  assert.equal(describeFilters({ currencies: ["JPY"], impacts: [] }), "JPY");
});

check("groupByDay splits at local midnight and keeps order", () => {
  const groups = groupByDay(events);
  assert.deepEqual(
    groups.map((group) => [group.key, titles(group.events)]),
    [
      ["2026-11-09", ["RBA Assist Gov Hunter Speaks", "CPI y/y"]],
      ["2026-11-10", ["Core CPI m/m"]],
      ["2026-11-11", ["Bank Holiday", "FOMC Member Speaks"]],
    ],
  );
});

/**
 * The month page was read with curl on 2026-11-18 (https://www.forexfactory.com/calendar?month=dec.2026,
 * HTTP 200, 1.4 MB): the events sit in a JSON array named `days` inside `calendarComponentStates[1]`, and
 * each carries `dateline`, a UTC unix time. The fixture is six events and two days cut from that page; its
 * times were checked against the page's own labels, shown in the reader's zone (Europe/Minsk, UTC+3):
 * "2:30am" on 1 Dec is 23:30 UTC on 30 Nov.
 */
const MONTH = parseMonthPage(readFileSync("test/fixtures/ff-december-excerpt.html", "utf8"));
const byTitle = (title: string) => MONTH.events.find((event) => event.title === title)!;

check("parseMonthPage reads the dateline as UTC and the fields as the page spells them", () => {
  assert.equal(MONTH.events.length, 6);
  const first = MONTH.events[0]!;
  assert.equal(first.title, "Unemployment Rate");
  assert.equal(first.currency, "JPY");
  assert.equal(first.impact, "Low");
  assert.equal(first.at, Date.UTC(2026, 10, 30, 23, 30));
  assert.equal(first.timeLabel, undefined);
  assert.equal(byTitle("GDP q/q").impact, "High");
  assert.equal(byTitle("GDP q/q").at, Date.UTC(2026, 11, 2, 0, 30));
  assert.equal(byTitle("Italian Bank Holiday").impact, "Holiday");
});

check("parseMonthPage keeps the figures, unescapes slashes and names a time that is not a clock", () => {
  assert.equal(byTitle("ANZ Job Advertisements m/m").previous, "2.2%");
  assert.equal(byTitle("RCM/TIPP Economic Optimism").timeLabel, "Tentative");
  assert.equal(byTitle("ANZ Job Advertisements m/m").timeLabel, "Oct data");
  assert.equal(byTitle("Italian Bank Holiday").timeLabel, "All Day");
  assert.equal(byTitle("Unemployment Rate").forecast, "");
});

check("parseMonthPage reports which days the page covers, from its first and last day", () => {
  // The page's days start at 00:00 Minsk: 21:00 UTC the evening before.
  assert.equal(MONTH.from, Date.UTC(2026, 10, 30, 21, 0));
  assert.equal(MONTH.to, Date.UTC(2026, 11, 31, 21, 0));
});

check("parseMonthPage says so when the page is a bot check or has changed", () => {
  assert.throws(() => parseMonthPage("<html><title>Just a moment...</title></html>"), /no calendar data/);
  assert.throws(() => parseMonthPage("calendarComponentStates[1] = {\n days: [{broken"), /unexpected/);
  assert.throws(() => parseMonthPage("calendarComponentStates[1] = {\n days: [],\n};"), /unexpected/);
});

check("monthUrl uses the site's month.year spelling", () => {
  assert.equal(monthUrl({ year: 2026, month: 12 }), "https://www.forexfactory.com/calendar?month=dec.2026");
  assert.equal(monthUrl({ year: 2027, month: 1 }), "https://www.forexfactory.com/calendar?month=jan.2027");
});

check("shiftMonth crosses year ends in both directions", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 5 }, 0), { year: 2026, month: 5 });
});

check("mergeEvents keeps an event that two neighbouring pages both hold once, in time order", () => {
  const edge = MONTH.events[0]!;
  const later = { ...edge, title: "Later", at: edge.at + 1000 };
  const merged = mergeEvents([{ events: [later, edge] }, { events: [edge] }]);
  assert.deepEqual(merged.map((event) => event.title), ["Unemployment Rate", "Later"]);
});

check("uncoveredSides asks for the neighbour only on the side the pages fall short", () => {
  const page = { from: 1000, to: 2000 };
  assert.deepEqual(uncoveredSides([page], [1000, 2000]), { before: false, after: false });
  assert.deepEqual(uncoveredSides([page], [900, 2000]), { before: true, after: false });
  assert.deepEqual(uncoveredSides([page], [1000, 2100]), { before: false, after: true });
  assert.deepEqual(uncoveredSides([page, { from: 2000, to: 3000 }], [1500, 2800]), { before: false, after: false });
});

check("the month periods are whole local months, and the range is the chosen days", () => {
  const now = new Date("2026-11-18T12:00:00+03:00");
  assert.deepEqual(periodBounds("month", now), [Date.parse("2026-11-01T00:00:00+03:00"), Date.parse("2026-12-01T00:00:00+03:00")]);
  assert.deepEqual(periodBounds("nextmonth", now), [Date.parse("2026-12-01T00:00:00+03:00"), Date.parse("2027-01-01T00:00:00+03:00")]);
  assert.deepEqual(periodBounds("lastmonth", now), [Date.parse("2026-10-01T00:00:00+03:00"), Date.parse("2026-11-01T00:00:00+03:00")]);
  const range: [number, number] = [Date.parse("2025-03-10T00:00:00+03:00"), Date.parse("2025-03-15T00:00:00+03:00")];
  assert.deepEqual(periodBounds("range", now, range), range);
  assert.deepEqual(periodBounds("range", now), [0, 0]);
});

check("monthsOf lists the local months a half-open span touches", () => {
  const at = (iso: string) => Date.parse(`${iso}T00:00:00+03:00`);
  assert.deepEqual(monthsOf(at("2026-12-01"), at("2027-01-01")), [{ year: 2026, month: 12 }]);
  assert.deepEqual(monthsOf(at("2026-12-20"), at("2027-01-11")), [{ year: 2026, month: 12 }, { year: 2027, month: 1 }]);
  assert.deepEqual(monthsOf(at("2024-01-15"), at("2024-04-02")).map((m) => m.month), [1, 2, 3, 4]);
  assert.deepEqual(monthsOf(0, 0), []);
});

check("sourceOf keeps the weekly feed for the week periods and reads month pages for the rest", () => {
  const now = new Date("2026-11-18T12:00:00+03:00");
  assert.deepEqual(sourceOf("today", now), { key: "thisweek", kind: "week", week: "thisweek" });
  assert.deepEqual(sourceOf("nextweek", now), { key: "nextweek", kind: "week", week: "nextweek" });
  assert.deepEqual(sourceOf("nextmonth", now), {
    key: "months:2026-12",
    kind: "months",
    months: [{ year: 2026, month: 12 }],
    span: [Date.parse("2026-12-01T00:00:00+03:00"), Date.parse("2027-01-01T00:00:00+03:00")],
  });
  const range: [number, number] = [Date.parse("2026-12-20T00:00:00+03:00"), Date.parse("2027-01-11T00:00:00+03:00")];
  assert.equal(sourceOf("range", now, range).key, "months:2026-12,2027-01");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
