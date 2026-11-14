# cTrader P/L

Unrealised profit and loss from your own cTrader account, with every open position
and its own P/L. A Vicinae front end for the cTrader Open API, where
[`gandhik/omarchy-ctrader-pl`](https://github.com/gandhik/omarchy-ctrader-pl) is a
bar widget; the pill, its history and its `ctrader-poll` unit are cut.

| Command | Does |
| --- | --- |
| cTrader P/L | unrealised total, balance, equity, margin and every open position |

| Action | Key |
| --- | --- |
| Open Chart | `ctrl+o` |
| Copy Total / Copy Value | `ctrl+c` |
| Copy Symbol | `ctrl+shift+c` |
| Refresh | `ctrl+r` |
| Change Account | `ctrl+e` |

## Setup

1. At [openapi.ctrader.com](https://openapi.ctrader.com), add an application with
   the redirect URI `http://localhost:7331/callback` and copy its id and secret.
2. Run **cTrader P/L**, choose *Connect Account*, paste both, pick Demo or Live,
   and authorise in the browser tab. cTrader sends the code to `127.0.0.1:7331`,
   which the form listens on until it fills in.

The token asks for the `accounts` scope only: it can read the account and cannot
place, amend or close an order. Several accounts in that environment make the form
ask which one to show.

Credentials and tokens live in
`~/.local/share/vicinae/support/ctrader-pl/config.json`, mode `0600`; deleting
that file is "disconnect".

## How it works

Read over the Open API socket (`{demo,live}.ctraderapi.com:5036`): app and account
authentication, then `Reconcile` for positions, `UnrealizedPnL` for their P/L and
`Trader` for the balance, with `Symbols` and `SymbolById` for names, lot size and
digits. Money arrives as an integer scaled by the `moneyDigits` of its own
message, so each is scaled where it arrives.

The connection belongs to the window: it opens on the first read, refreshes every
ten seconds and closes with the window. There is no heartbeat, because ten
seconds stays inside the measured thirty-second idle timeout. An expired token is
refreshed once and the read retried; anything else becomes an error row with
**Try Again**.

## Settings

**TradingView exchange** prefixes your broker's CFD symbols (`MYBROKER:EURUSD`);
share CFDs open the underlying exchange with or without a prefix.

## Not verified

Nothing behind authentication was measured: this was written without a cTrader
login or an Open API application. Positions, P/L, scaling and token refresh are
checked against Spotware's descriptors and a local server speaking the measured
protocol.
