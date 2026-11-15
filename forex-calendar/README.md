# Forex Calendar

ForexFactory's economic calendar for the current week: events with impact,
forecast and previous, picked by period and filtered by impact and currency.
Written from scratch around the public weekly feed that Fair Economy (the
company behind ForexFactory) publishes; no account, no key, no scraping of the
calendar page.

| Command | Does |
| --- | --- |
| Economic Calendar | the week's events, in your time zone, with a period dropdown |

The dropdown holds **Today**, **Tomorrow**, **Upcoming** (from now to the end of
the week), **This Week** (grouped by day) and **Yesterday**. Typing in the
search bar filters by title, currency and impact (`usd high`, `cpi`).

| Action | Key |
| --- | --- |
| Copy Event | `ctrl+shift+c` |
| Open Calendar in Browser | `ctrl+o` |
| Refresh | `ctrl+r` |
| Open Preferences (empty view only) | `ctrl+,` |

## Preferences

| Preference | Default | Meaning |
| --- | --- | --- |
| Minimum Impact | Everything | Everything, Medium and High, or High only. Holidays show only under Everything |
| Currencies | empty | Codes to keep, e.g. `USD,EUR,GBP`. Events marked for every market always show; empty keeps all |

## How it works

The feed is `https://nfs.faireconomy.media/ff_calendar_thisweek.json`, read when
the command opens. The last good body is kept in `Cache` for 30 minutes, a
manual refresh skips that but never hits the feed twice within a minute, and no
timer runs while the window is open. A failed read keeps the saved copy and adds
a `Showing the saved copy` row with the reason; with no saved copy the window
says what failed and offers **Try Again**.

Times come from the feed with a UTC offset and are shown in this machine's time
zone, so "Today" means your calendar day, not New York's.

## Limits

- **The feed holds only the current week.** There is no history and no next
  week, so there is no month view and no custom date range beyond what the
  week contains. Around the weekly rollover (Sunday evening in New York),
  "Tomorrow" can be empty until the feed switches to the new week.
- **No actual values.** The feed carries forecast and previous only.
- **No event details or history of an indicator.** Those exist only on the web
  calendar; **Open Calendar in Browser** goes there.
- This is not an official API. ForexFactory can change or restrict the feed;
  using it for anything beyond personal use is for you to check against their
  terms.

## Verified, and not

Measured on 2026-11-15: the feed's shape (fields, date format with a `-05:00`
offset, impact values Low, Medium, High, Holiday, countries including `All`).
That read went through a web-fetch tool, because the sandbox's proxy refused
the host; the headers, the response size and any rate limiting were not
measured, so the 30-minute and one-minute limits above are a precaution, not a
finding.

`npm run lint`, `check`, `test` and `build` pass. The self-check covers parsing,
day boundaries (including a 25-hour daylight saving day), period selection and
the impact and currency filters.

**Not verified:** the command was never launched in Vicinae and the UI was not
looked at; the fetch from inside Vicinae's runtime was not run; the cache
fallback after a failed fetch was not exercised.
