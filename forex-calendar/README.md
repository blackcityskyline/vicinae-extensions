# Forex Calendar

ForexFactory's economic calendar: events with impact, forecast and previous,
picked by period, with the currencies and impact levels you choose. Written
from scratch: day/week periods use the public weekly feeds that Fair Economy
(the company behind ForexFactory) publishes; month periods and a custom range
read the site's month pages, so any date can be shown. No account, no key.

| Command | Does |
| --- | --- |
| Economic Calendar | the week's events, in your time zone, with a period dropdown and two filters |

Periods: **Today**, **Tomorrow**, **Upcoming** (now → end of week), **This Week**,
**Next Week** (grouped by day), **Yesterday**; then **This Month**, **Next
Month**, **Last Month** and **Custom Range** (the first and last day picked,
up to 12 months, both days included). Search filters by title, currency and
impact (`usd high`, `cpi`).

| Action | Key |
| --- | --- |
| Copy Event | `ctrl+shift+c` |
| Open Calendar in Browser | `ctrl+o` |
| Choose Currencies | `ctrl+u` |
| Choose Impact | `ctrl+i` |
| Choose Dates (Custom Range only) | `ctrl+g` |
| Clear Filters (shown only while a filter is on) | `ctrl+shift+u` |
| Refresh | `ctrl+r` |
| Apply (in either filter form) | `ctrl+s` |

## Filters

Currency and impact filters: tick any set (e.g. High only, or everything but
Holiday). Events marked for every market (`All` in the feed) always show.
Ticking everything or nothing means no restriction.

While a filter is on, a `Filters on` row says what is active. The choice is
saved in `Cache` and applies to every period.

## How it works

**Month pages.** Month periods and the custom range read
`https://www.forexfactory.com/calendar?month=dec.2026` with `curl` — about
1.4 MB per month, one after another. The events are JSON in
`calendarComponentStates[1]`, each with a UTC `dateline`, so times don't depend
on the zone the site assumed for the reader. A month's parsed events are
cached for 30 minutes while current or recent, and until asked again once it
ended more than a week ago. An unreadable month is named in a `Showing the
saved copy` row while the others still show. Days render in your zone, so a
range edge spilling into a neighbouring month reads that month too. These pages
carry **actual** values and mark non-clock times (`Tentative`, `All Day`, a
data month) with the page's own word.

**Weekly feeds.** The feeds are `https://nfs.faireconomy.media/ff_calendar_thisweek.json`
and `ff_calendar_nextweek.json`. A feed is read when its period is first shown;
the last good body is cached for 30 minutes. A manual refresh skips the cache
but never hits a feed twice within a minute; no timer runs with the window
open. A failed read keeps the saved copy and adds the reason to `Showing the
saved copy`; with no copy, **Try Again**.

Times are shown in this machine's zone; "Today" is your calendar day.

## Limits

- **The weekly feeds hold one week.** For other dates use the month periods or
  a custom range. **Upcoming** reads only this week's feed, so on the last day
  of the week it shows little; switch to **Next Week**. Around the rollover
  (Sunday evening New York), "Tomorrow" can be empty until the feed switches to
  the new week.
- **No actual values from the weekly feeds.** They carry forecast and previous
  only; the month pages add actual. Far-future months have few or no figures yet.
- **ForexFactory's page, not an API.** It is a page of a site that filters bots,
  read with `curl` and a browser-like agent; it can start to refuse, or change
  its markup, and then the month periods show the reason while the weekly feeds
  keep working.
- **No event details or history of an indicator.** Those exist only on the web
  calendar; **Open Calendar in Browser** goes there.
- This is not an official API. ForexFactory can change or restrict the feeds;
  using them for anything beyond personal use is for you to check against their
  terms.

## Verified, and not

Measured 2026-11-15: the `thisweek` feed's shape (fields, `-05:00` date
format, impacts Low/Medium/High/Holiday, country `All`). Read through a
web-fetch tool: the sandbox proxy refused the host; headers, response size and
rate limiting were not measured, so the 30-minute/1-minute limits are a
precaution, not a finding.

`npm run lint`, `check`, `test` and `build` pass. Self-checks cover parsing,
day boundaries (incl. a 25-hour DST day), period selection, impact and
currency filtering, and reading a saved filter back.

**Month pages.** Measured 2026-11-18: `?month=dec.2026` with `curl` — HTTP 200,
372 events, 31 days, impacts low/medium/high/holiday, times shown for
Europe/Minsk, `dateline` UTC. The parser's checks run on a six-event cut, with
times checked against the page's own labels. Only December 2026 was read.

**Not verified:**

- **Any month but December 2026.** The other months' `?month=` spelling
  (`jan`–`nov`) is assumed from December's and the site's day links
  (`dec1.2026`); past months (which carry actual values) were not read, so the
  `actual` field on real data is untested.
- **The extension's `curl` through Node's `fetch`** and a non-owner's `curl`
  were not tried.
- **The custom range form and the month periods in Vicinae** were not
  launched: compiling, bundling and parsing a saved page passed only.
- **The `nextweek` feed.** Its name follows the `thisweek` one, but it could not
  be fetched here: nothing confirms it exists, what it holds, or when it starts
  to be published. If it answers 404, **Next Week** says so. Check it with
  `curl -s https://nfs.faireconomy.media/ff_calendar_nextweek.json | head -c 300`.
- The filter forms, the saved filter across launches and the cache fallback
  after a failed fetch were never exercised in Vicinae. The first version of the
  command was launched and looked at by its owner; this one has not been.
