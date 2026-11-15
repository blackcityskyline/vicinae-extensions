# Forex Calendar

ForexFactory's economic calendar: events with impact, forecast and previous,
picked by period, with the currencies and impact levels you choose to see.
Written from scratch around the public weekly feeds that Fair Economy (the
company behind ForexFactory) publishes; no account, no key, no scraping of the
calendar page.

| Command | Does |
| --- | --- |
| Economic Calendar | the week's events, in your time zone, with a period dropdown and two filters |

The dropdown holds **Today**, **Tomorrow**, **Upcoming** (from now to the end of
this week), **This Week**, **Next Week** (both grouped by day) and
**Yesterday**. Typing in the search bar filters by title, currency and impact
(`usd high`, `cpi`).

| Action | Key |
| --- | --- |
| Copy Event | `ctrl+shift+c` |
| Open Calendar in Browser | `ctrl+o` |
| Choose Currencies | `ctrl+u` |
| Choose Impact | `ctrl+i` |
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

The feeds are `https://nfs.faireconomy.media/ff_calendar_thisweek.json` and
`ff_calendar_nextweek.json`. A feed is read when its period is first shown, and
its last good body is kept in `Cache` for 30 minutes. A manual refresh skips
that but never hits a feed twice within a minute, and no timer runs while the
window is open. A failed read keeps the saved copy and adds a
`Showing the saved copy` row with the reason; with no saved copy the window says
what failed and offers **Try Again**.

Times come from the feed with a UTC offset and are shown in this machine's time
zone, so "Today" means your calendar day, not New York's.

## Limits

- **A feed holds one week.** There is no history and no month view. **Upcoming**
  reads this week's feed only, so on the last day of the week it shows little;
  switch to **Next Week**. Around the weekly rollover (Sunday evening in New
  York), "Tomorrow" can be empty until the feed switches to the new week.
- **No actual values.** The feeds carry forecast and previous only.
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

**Not verified:**

- **The `nextweek` feed.** Its name follows the `thisweek` one, but it could not
  be fetched here: nothing confirms it exists, what it holds, or when it starts
  to be published. If it answers 404, **Next Week** says so. Check it with
  `curl -s https://nfs.faireconomy.media/ff_calendar_nextweek.json | head -c 300`.
- The filter forms, the saved filter across launches and the cache fallback
  after a failed fetch were never exercised in Vicinae. The first version of the
  command was launched and looked at by its owner; this one has not been.
