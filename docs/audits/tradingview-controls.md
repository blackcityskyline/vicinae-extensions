# `tradingview-controls` — do not port

Source: `raycast/extensions`, `extensions/tradingview-controls` — author `skaj`,
`platforms: ["macOS"]`, one dependency beyond the Raycast API: `run-applescript`.
No HTTP request anywhere in the extension.

## What it is

It does not talk to TradingView; it types text and presses keys into whatever
window has focus, as a person would. Five commands, each a few keystrokes:

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

Around it, `delay 1` between steps and a wait for the app to wake up. Nothing
checks that any of it landed.

## Three dependencies, any of which can be missing

1. **The desktop app.** On Linux only as a community build,
   `chaotic-aur/tradingview 3.4.1-1`, 21.78 MiB; not installed here.
2. **Keystrokes into another window.** `wtype`, `ydotool`, `xdotool` and `keyd`
   installed, `/dev/uinput` present with `rw-` for the user; `wtype` verified —
   focused a terminal, typed `BTCHUSDT`, read the file back.
3. **TradingView's own shortcuts.** The hardcoded Option+W, Option+N, Cmd+Shift+S
   are the **macOS** defaults; the Linux build ships different ones and cannot
   remap them at all.

## Why not port it

It ports one for one (`wtype` replaces `run-applescript`), but it needs the AUR
package installed, the keys have to be discovered and hardcoded for the Linux
build, and **there is no guarantee of anything**: it never checks the result of a
single action, so with the window unfocused the ticker is typed into whatever is
in front, and the extension cannot tell. The failure mode is not "the site
changes and the scraper breaks" but "keystrokes go somewhere they were not meant
to go".

## What does work on Linux

Both measured, no key, no desktop app:

```
https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT    200
https://www.tradingview.com/chart/?symbol=MOEX:SBER           200

https://scanner.tradingview.com/symbol?symbol=BINANCE:BTCUSDT&fields=close
  {"close":84176.01}
```

A symbol opener for the web version and a price lookup both work with nothing
installed: a different extension, wrong in one way the same way every time
instead of in whatever way the focused window happens to be. Worth writing if
TradingView is wanted; it is not a port.
