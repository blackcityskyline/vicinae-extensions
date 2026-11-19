# Forex Calendar

ForexFactory's economic calendar: events with impact, forecast and previous,
picked by period, with the currencies and impact levels you choose to see.
Written from scratch. The day and week periods use the public weekly feeds that
Fair Economy (the company behind ForexFactory) publishes; the month periods and
a custom range of days read ForexFactory's own month pages, so any date in the
past or the future can be shown. No account, no key.

| Command | Does |
| --- | --- |
| Economic Calendar | the week's events, in your time zone, with a period dropdown and two filters |

The dropdown holds **Today**, **Tomorrow**, **Upcoming** (from now to the end of
this week), **This Week**, **Next Week** (both grouped by day) and
**Yesterday**, then **This Month**, **Next Month**, **Last Month** and
**Custom Range**, which shows the first and last day you pick with **Choose
Dates** (up to 12 months, both days included). Typing in the search bar filters by title, currency and impact
(`usd high`, `cpi`).

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

**Choose Currencies** lists every currency the feeds have shown; tick the ones
to display, one or several. **Choose Impact** lists High (red), Medium (orange),
Low (yellow) and Holiday (grey); tick any set, for example High only, or
everything except Holiday. Events marked for every market (`All` in the feed)
always show. Ticking everything, or nothing, means no restriction.

While a filter is on, a `Filters on` row at the top says what is active. The
choice is saved in `Cache`, in its own namespace, and applies to every period.

## How it works

**Month pages.** The month periods and the custom range read
`https://www.forexfactory.com/calendar?month=dec.2026` with `curl`, one page
(about 1.4 MB) per month, one after another. The page keeps its events as JSON
in `calendarComponentStates[1]`, each with a UTC `dateline`, so times do not
depend on the time zone the site assumed for the reader. The parsed events of a
month are kept in `Cache`: for 30 minutes while the month is current or recent,
and until asked again once it ended more than a week ago. A month that cannot be
read is named in a `Showing the saved copy` row while the others still show. A
page lists its days in the reader's zone, so when it leaves the start or end of
your range uncovered the neighbouring month is read as well. These pages carry
**actual** values (`A` in the row) and mark times that are not a clock
(`Tentative`, `All Day`, a data month) with the page's own word.

**Weekly feeds.** The feeds are `https://nfs.faireconomy.media/ff_calendar_thisweek.json` and
`ff_calendar_nextweek.json`. A feed is read when its period is first shown, and
its last good body is kept in `Cache` for 30 minutes. A manual refresh skips
that but never hits a feed twice within a minute, and no timer runs while the
window is open. A failed read keeps the saved copy and adds a
`Showing the saved copy` row with the reason; with no saved copy the window says
what failed and offers **Try Again**.

Times come from the feed with a UTC offset and are shown in this machine's time
zone, so "Today" means your calendar day, not New York's.

## Limits

- **The weekly feeds hold one week.** For other dates use the month periods or a
  custom range. **Upcoming**
  reads this week's feed only, so on the last day of the week it shows little;
  switch to **Next Week**. Around the weekly rollover (Sunday evening in New
  York), "Tomorrow" can be empty until the feed switches to the new week.
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

Measured on 2026-11-15: the shape of the `thisweek` feed (fields, date format
with a `-05:00` offset, impact values Low, Medium, High, Holiday, countries
including `All`). That read went through a web-fetch tool, because the sandbox's
proxy refused the host; headers, response size and rate limiting were not
measured, so the 30-minute and one-minute limits above are a precaution, not a
finding.

`npm run lint`, `check`, `test` and `build` pass. The self-check covers parsing,
day boundaries (including a 25-hour daylight saving day), period selection,
impact and currency filtering, and reading a saved filter back.

**Month pages.** Measured on 2026-11-18: `?month=dec.2026` read with `curl` by
the owner on his machine answered HTTP 200 with the events as JSON (372 events,
31 days, impact values low, medium, high, holiday; times shown for Europe/Minsk,
`dateline` UTC). The parser's checks run on a six-event cut of that page, with
times checked against the page's own labels. That is the only month read.

**Not verified:**

- **Any month but December 2026.** The other months' `?month=` spelling (`jan`
  to `nov`) is assumed from December's and the site's day links (`dec1.2026`).
  Past months, which carry actual values, were not read, so the `actual` field
  on real data is untested.
- **That the extension's `curl` is let through.** The owner's `curl` was; whether
  the page keeps answering, or answers the same from another address, is
  unknown. Fetching it from Node's `fetch` was not tried.
- **The custom range form** (the date pickers) and the month periods in Vicinae.
  Compiling, bundling and parsing a saved page passed; nothing was launched.
- **The `nextweek` feed.** Its name follows the `thisweek` one, but it could not
  be fetched here: nothing confirms it exists, what it holds, or when it starts
  to be published. If it answers 404, **Next Week** says so. Check it with
  `curl -s https://nfs.faireconomy.media/ff_calendar_nextweek.json | head -c 300`.
- The filter forms, the saved filter across launches and the cache fallback
  after a failed fetch were never exercised in Vicinae. The first version of the
  command was launched and looked at by its owner; this one has not been.
