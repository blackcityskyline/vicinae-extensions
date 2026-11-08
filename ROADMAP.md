# Roadmap

Backlog of extensions considered next; finished work is in the [README](README.md) table.
Target: Linux / Hyprland / Wayland / Arch, local install only, no store submission.

## In progress

| Extension | Source | State |
| --------- | ------ | ----- |
| `markdown` → `webpage-to-markdown` | `treyg/webpage-to-markdown` | Ships, but `r.jina.ai` answers 451 from this machine without a Jina key. Needs a registered key |

## Next

| Extension | Source | Note |
| --------- | ------ | ---- |
| `todo-list` | `maggie/todo-list` | Menu bar must be cut — `MenuBarExtra` unsupported |
| `tldr` | `pomdtr/tldr` | No local pages; needs network or the Arch package |
| `localsend` | `kud` | Unmeasured. Probe `/api/v2/info` first |
| `system-information` | `Visual-Studio-Coder` | Last. Source undecided: `inxi -xxx`, `lshw -json`, `/proc`, sysfs |

## Needs an audit

| Extension | Source | Note |
| --------- | ------ | ---- |
| `Urban Dictionary` | `pernielsentikaer/urban-dictionary` | Keyless, 200. Needs a timeout; the API is unstable |
| `Dictionary` | dictionaryapi.dev + Wiktionary | dictionaryapi.dev answers 522 for Russian; Wiktionary covers it |
| `genius-lyrics` | `tkdkid1000/genius-lyrics` | Needs a Genius token |
| `opencode` | `vimtor/opencode` | Contract unknown: how does it expose its model list? |
| `obs-control` | `Yukai/obs-control` | OBS over `localhost:4455` |
| `super-productivity` | `pvnkmnk/super-productivity` | REST API |
| `qbittorrent` | `pernielsentikaer/qbittorrent` | WebUI API; needs the daemon running |
| `transmission` | `FezVrasta/transmission` | Old project, presence unverified |
| `open-maps` | `crisboarna/openstreetmap-search` | Native `geo:` URI. Take this, not `apple-maps-search` |
| `openweathermap` | `tonka3000` | Free tier with a key |
| `scrcpy` | `zcfan` | Useful with a phone; in Arch |
| `freesound` | `j3lte` | Free API, one-off token |
| `neovim` | `RG-IL` | `nvim --headless` is a route; close to `vim-bro` |
| `twitch-chat` | `Aayush9029/twitch-chat` | IRC bridge removed in 2023 |
| `git` | `ernest0n` | Largest item. Weeks of work. **An extension cannot launch a TUI** |

## Omarchy plugins (new batch)

From the Omarchy plugin ecosystem (bar widgets). Catalog: https://plugins.omarchy.org/?page=96#catalog

| Extension | Source | Note |
| --------- | ------ | ---- |
| `appimage-manager` | [bmaltais/StartAppImage](https://github.com/bmaltais/StartAppImage) | Install, update and manage AppImages: double-click install card, searchable manager, per-app settings |
| `ctrader-pl` | [gandhik/omarchy-ctrader-pl](https://github.com/gandhik/omarchy-ctrader-pl) | Live cTrader P/L, open positions popup, P&L history |
| `prices` | [medden/omarchy-prices](https://github.com/medden/omarchy-prices) | FX and crypto prices widget |
| `ytdlp` | [Alibest69420/omarchy-ytdlp](https://github.com/Alibest69420/omarchy-ytdlp) | yt-dlp audio and video downloads |
