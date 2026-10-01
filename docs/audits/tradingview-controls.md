# Audit: `tradingview-controls` → do not port

Source: `raycast/extensions`, `extensions/tradingview-controls` — author `skaj`,
`platforms: ["macOS"]`, one dependency beyond the Raycast API: `run-applescript`.

**The record before this said "no verdict, almost certainly scraping". That was wrong
twice.** It is not scraping — there is no HTTP request anywhere in the extension — and
that was not the fragile part.

## What it actually is

The extension does not talk to TradingView. It does not know what TradingView is. It
types text and presses keys into whatever window has focus, as if a person had done it.
Five commands, each a few keystrokes:

| Command | Does | Keystrokes |
| --- | --- | --- |
| Open Symbol | open a ticker | type the ticker, Enter |
| Add Symbol to Watchlist | add to favourites | Option+W |
| Take Chart Screenshot | screenshot the chart | Option+Cmd+S |
| Take Chart Screenshot and Copy | same, into the clipboard | Shift+Cmd+S |
| Add Note to Symbol | attach a note | Option+N, type the text, Enter |
| Change Chart Interval | set the timeframe | digits, Enter |

The whole of "Open Symbol":

```applescript
tell application "System Events"
  keystroke symbol
  keystroke return
end tell
```

Around it, `delay 1` between steps and a wait for the app to wake up. Nothing checks
that any of it landed.

## Three dependencies, any of which can be missing

1. **The desktop app.** On Linux it exists only as a community build:
   `chaotic-aur/tradingview 3.4.1-1`, 21.78 MiB. Not installed on this machine.
2. **Keystrokes into another window.** Better than expected here — `wtype`, `ydotool`,
   `xdotool` and `keyd` are all installed, `/dev/uinput` exists, and its ACL grants the
   user `rw-`. `wtype` verified working: focused a terminal, typed `BTCHUSDT`, read the
   file back.
3. **TradingView's own shortcuts.** This is the real one. The extension hardcodes
   Option+W, Option+N, Cmd+Shift+S, which are the **macOS** defaults. The Linux build
   ships different ones, and under the Windows/Linux build they cannot be remapped at
   all.

## Why not port it

Technically it ports cleanly — `wtype` replaces `run-applescript` one for one. But:

- it needs the AUR package installed;
- the keys have to be discovered and hardcoded for the Linux build, not copied from
  macOS;
- **there is no guarantee of anything.** The extension is blind: it never checks the
  result of a single action. If the window is not focused, the ticker is typed into
  whatever is in front, and the extension cannot tell. That is worse than fragile — it
  is wrong without saying so.

The honesty argument cuts the other way from what the record assumed. The failure mode is
not "the site changes and the scraper breaks". It is "keystrokes go somewhere they were
not meant to go".

## What does work on Linux

Both measured, no key, no desktop app:

```
https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT    200
https://www.tradingview.com/chart/?symbol=MOEX:SBER           200

https://scanner.tradingview.com/symbol?symbol=BINANCE:BTCUSDT&fields=close
  {"close":84176.01}
```

So a symbol opener for the web version, and a price lookup, both work with nothing
installed. That is a different extension and a sounder one — it can be wrong in one way,
the same way every time, instead of in whatever way the focused window happens to be.
Worth writing if TradingView is wanted at all. It is not a port.
