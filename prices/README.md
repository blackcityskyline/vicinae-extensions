# Prices

Crypto prices and FX rates, with the change over the last 24 hours or trading
day. A Vicinae front end for
[`medden/omarchy-prices`](https://github.com/medden/omarchy-prices); the bar
pill and QML chart are cut — each ticker is a row, and **Open Chart** goes to
the ticker's public page.

| Command | Does |
| --- | --- |
| Prices | crypto and FX tickers in two sections, refreshed while the window is open |

| Action | Key |
| --- | --- |
| Open Chart | `ctrl+o` |
| Copy Price | `ctrl+c` |
| Refresh | `ctrl+r` |
| Open Preferences | `ctrl+,` |

## Preferences

| Preference | Default | Meaning |
| --- | --- | --- |
| Crypto | `bitcoin,ethereum` | CoinGecko ids, comma-separated; empty hides crypto |
| Crypto quote currency | `usd` | what crypto prices are quoted in |
| FX pairs | `EUR/USD,GBP/USD` | `BASE/QUOTE`, comma-separated; empty hides FX |

## How it works

Crypto: CoinGecko's keyless `/simple/price` — one request per refresh for all
coins, the 24-hour change in the same response. FX: Yahoo Finance's chart
endpoint, one request per pair; pairs Yahoo does not list fall back to the ECB
reference rates read from Frankfurter and crossed locally — the ECB is only
contacted when Yahoo is missing a pair, so while Yahoo answers for every pair
it is not. Such a row carries its fixing date: those rates move once per
business day around 16:00 CET, not at weekends.

A Yahoo FX row shows the time Yahoo priced the quote (not the fetch time),
ending with `· stale` once older than ten minutes — the case for Friday's close
over a weekend. The ten minutes is a precaution, not measured.

Prices refresh on open and every minute while the window stays open; nothing
runs once it is closed. A failed refresh keeps the last prices and adds a
`Last refresh failed` row; with no previous read, the window says what failed
and offers **Try Again**.

## Requirements

`curl`, for Yahoo only — Yahoo answers `429` to Node's HTTP client here but
`200` to `curl` with a short agent. Internet to `api.coingecko.com`,
`query1.finance.yahoo.com`, `api.frankfurter.dev`. No account, no key.

## Limits

CoinGecko's free tier is limited per address; a mistyped coin id is not an error,
it simply has no quote.
