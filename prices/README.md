# Prices

Crypto prices and FX rates, with the change over the last 24 hours or trading
day. A Vicinae front end for
[`medden/omarchy-prices`](https://github.com/medden/omarchy-prices), an Omarchy
bar widget; the bar pill and its QML chart are cut, each ticker is a row and
**Open Chart** goes to the same ticker's public page.

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

Crypto comes from CoinGecko's keyless `/simple/price`: one request per refresh
for all coins, the 24-hour change in the same response. FX comes from Yahoo
Finance's chart endpoint, one request per pair; a pair Yahoo does not list falls
back to the ECB reference rates read from Frankfurter and crossed locally. Such
a row carries its fixing date, since those rates move once per business day
around 16:00 CET and not at weekends.

Prices refresh on open and every minute while the window stays open; nothing
runs once it is closed. A failed refresh keeps the last prices and adds a
`Last refresh failed` row; with no previous read, the window says what failed
and offers **Try Again**.

## Requirements

`curl`, used only for Yahoo, which answers `429` to Node's HTTP client here and
`200` to `curl` with a short agent. Internet access to `api.coingecko.com`,
`query1.finance.yahoo.com` and `api.frankfurter.dev`. No account, no key.

## Limits

CoinGecko's free tier is limited per address; a mistyped coin id is not an error,
it simply has no quote.
