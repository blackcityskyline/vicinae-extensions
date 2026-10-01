# Roadmap

Raycast extensions considered for porting to Vicinae. Status only; the reasoning and the
measurements behind each entry are in [ROADMAP-NOTES.md](ROADMAP-NOTES.md), which is local and
not committed.

Target for every entry: Linux / Hyprland / Wayland / Arch, local install only, no store
submission.

## Done

| Extension | Source |
| --------- | ------ |
| `bitwarden` | Linux fork of the Raycast extension. Reference implementation |
| `github` | `raycast/extensions` — repository search, issues, PRs, workflows, notifications |
| `google-translate` | `raycast/extensions` — upstream deployed |
| `lastfm` | `raycast/extensions` — Browse, artist page, `keywords` added |
| `downloads-manager` | `thomas/downloads-manager` — upstream deployed, `gio trash` |
| `vim-bro` | `ajaypremshankar/vim-bro` — upstream deployed, 181 commands |
| `markdown` | `markdown-to-rich-text` + `webpage-to-markdown` merged |
| `bible` | `josmithua/bible` — upstream deployed, parser repaired |
| `url-kit` | `url-tools` + `url-shortener` merged |
| `cron-kit` | `cron-description` + `cron-manager` merged |
| `in-the-time-zone` | `i_idz/in-the-time-zone` |
| `shell-history` | `koinzhang/shell-history` |
| `tempmail` | `Joshlucpoll/tempmail` |
| `vectis` | power, TDP cap and GPU mode through `vectisd` |
| `wallhaven` | `devadathanmb` — upstream deployed, wallpaper backend detected and driven |

## In progress

| Extension | Source | State |
| --------- | ------ | ----- |
| `markdown` → `webpage-to-markdown` | `treyg/webpage-to-markdown` | **Blocked.** `r.jina.ai` answers 451 from this machine, with or without a key. Needs a registered Jina key |

## Next

| Extension | Source | Note |
| --------- | ------ | ---- |
| `lucide-icons` | `Sn0wye` | Vicinae renders SVG. All three `lucide.dev` endpoints answer 200 |
| `dpaste` | replaces `pastebin` | No registration needed. Two commands become one |
| `todo-list` | `maggie/todo-list` | Menu bar must be cut — `MenuBarExtra` unsupported |
| `tldr` | `pomdtr/tldr` | No local pages; needs network or the Arch package |
| `localsend` | `kud` | Unmeasured. Probe `/api/v2/info` first |
| `material-icons` | `creasty` | Same queue as lucide, not in parallel |
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

## Not portable

| Extension | Source | Why |
| --------- | ------ | --- |
| `tradingview-controls` | `skaj/tradingview-controls` | Blind keystroke driver. Types into whatever is focused and cannot check it worked |
| `ffmpeg` | `RenderCoder` | Entry point is `getSelectedFinderItems()`; Vicinae throws `not implemented`. Fixing it means rewriting the input layer |
| `font-sniper` | `riomadeit/font-sniper` | Needs JS injection into a browser page; Vicinae can only read |

## Closed

| Extension | Source | Closed by |
| --------- | ------ | --------- |
| `fuzzy-file-search` | `erykksc` | `store.vicinae.fuzzy-files` |
| `two-factor-authentication-code-generator` | `cjdenio` | Our `bitwarden` — TOTP |
| `macosicons` | `shldk` | **Postponed, not rejected.** Needs a registered key for `search-icons`; `manage-icons` is macOS-only. See icons above |
| `pastebin` | `vimtor` | Replaced by `dpaste`. All three preferences required, plus an API key |