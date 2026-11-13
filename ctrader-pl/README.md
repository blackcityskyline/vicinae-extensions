# cTrader P/L

Unrealised profit and loss from your own cTrader account, with every open position and its own
P/L.

It is a Vicinae front end for the cTrader Open API: a launcher command where
[`gandhik/omarchy-ctrader-pl`](https://github.com/gandhik/omarchy-ctrader-pl) is a bar widget. The
plugin's QML pill, its `P&L` history and its `ctrader-poll` systemd unit are cut; what the window
shows is read while the window is open.

## Command

| Command       | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| **cTrader P/L** | Unrealised total, balance, equity, margin and every open position      |

## Actions

| Action        | Shortcut  | Description                                            |
| ------------- | --------- | ------------------------------------------------------ |
| Open Chart    | `ctrl+o`  | The position's symbol on TradingView                   |
| Copy Total    | `ctrl+c`  | The account's net unrealised P/L                       |
| Copy Value    | `ctrl+c`  | A position's own P/L                                   |
| Copy Symbol   | `ctrl+shift+c` | The position's symbol                             |
| Refresh       | `ctrl+r`  | Read the account again, now                            |
| Change Account | `ctrl+e` | Back to the setup form                                 |

Every money row copies with `ctrl+c`; the position list puts `Open Chart` first, so `ctrl+o` is
the chart when a position is selected and the generic *open* verb otherwise.

## Setup

The extension cannot mint an Open API application, so you need one:

1. Sign in at [openapi.ctrader.com](https://openapi.ctrader.com) and add an application with the
   redirect URI `http://localhost:7331/callback`.
2. Copy its client id and secret.
3. Run **cTrader P/L**, choose *Connect Account*, paste both, pick Demo or Live, and authorise in
   the browser tab that opens. cTrader sends the code back to `127.0.0.1:7331`, which the form is
   listening on; the window fills in by itself.

The authorisation asks for the `accounts` scope only: the token can read the account and cannot
place, amend or close an order. If the token sees more than one account in that environment, the
form asks which one this command shows.

The client id, secret, tokens and chosen account live in
`~/.local/share/vicinae/support/ctrader-pl/config.json`, mode `0600`. Deleting that file is
"disconnect": the next launch asks to connect again.

## Requirements

- A cTrader account, demo or live, with an Open API application (above).
- Nothing else: no Python, no `ctrader-auth`, no daemon. The socket client, the OAuth token
  exchange and the loopback callback are in this extension.
- Port **7331** free for the few seconds the form waits for the browser.

## How it works

The account is read over the Open API socket (`{demo,live}.ctraderapi.com:5036`): app
authentication, account authentication, then `Reconcile` for the open positions, `UnrealizedPnL`
for their P/L and `Trader` for the balance. `Symbols` supplies the names and `SymbolById` the lot
size and price digits, fetched once per symbol per window. Money arrives as an integer scaled by
the `moneyDigits` of its own message, and those differ between messages, so each is scaled where
it arrives.

The connection belongs to the window. It opens on the first read, the list refreshes every ten
seconds while the window is open, and the socket closes when the window does: nothing runs in the
background between launches, and there is no heartbeat because a ten-second tick stays well inside
the measured thirty-second idle timeout. An expired access token is refreshed once and the read
retried; anything else surfaces as an error row with `Try Again`.

## Settings

| Setting              | Effect                                                                |
| -------------------- | --------------------------------------------------------------------- |
| TradingView exchange | Prefix for your broker's CFD symbols, e.g. `MYBROKER` opens `MYBROKER:EURUSD`. Blank lets TradingView pick a listing |

Share CFDs (`TLT.US`, `BHP.AU`, `VOD.UK`, `SAP.DE`) open the underlying exchange whether or not a
prefix is set.

## Not verified

Nothing behind authentication was measured against a real account: this was written without a
cTrader login and without an Open API application. Positions, P/L, the balance rows, the money
scaling and the token refresh are checked against Spotware's descriptors and a local server that
speaks the measured protocol, not against a live response. The form was driven as far as its
credential fields; the browser round trip needs your application. [`docs/audits/ctrader-pl.md`](../docs/audits/ctrader-pl.md)
has the measurements and the cut list.
