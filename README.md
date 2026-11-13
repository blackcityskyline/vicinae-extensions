# vicinae-extensions

Personal [Vicinae](https://vicinae.com) extensions. One directory per extension; each is a
standalone package that installs itself into `~/.local/share/vicinae/extensions`. Vicinae resolves
`@raycast/api` and `@raycast/utils` at runtime, so many Raycast extensions run as written with only
a manifest rewrite.

## Extensions

`Directory` links to the extension; `Source` links the upstream as `author/extension`. **Fork**
means the upstream was merged and corrected here; without it the upstream runs as deployed.

| Directory | Source | What it is |
| --------- | ------ | ---------- |
| [`bitwarden`](bitwarden/) | [jomifepe/bitwarden](https://github.com/raycast/extensions/tree/main/extensions/bitwarden), Linux fork | Vault search, TOTP and password generation. Reference implementation |
| [`bluetooth`](bluetooth/) | [gelei/vicinae-bluetooth](https://github.com/gelei/vicinae-bluetooth) (`vicinaehq/extensions`) | Upstream deploy. Bluetooth on/off, scan, paired devices and discoverable mode over BlueZ D-Bus |
| [`github`](github/) | [thomaslombart/github](https://github.com/raycast/extensions/tree/main/extensions/github) | Repository search, issues, pull requests, workflows and notifications. Replaces the store's thinner `github` |
| [`google-translate`](google-translate/) | [gebeto/translate](https://github.com/raycast/extensions/tree/main/extensions/google-translate) | Upstream deploy; the form also shows corrections, synonyms and definitions |
| [`lastfm`](lastfm/) | [eggsy/lastfm](https://github.com/raycast/extensions/tree/main/extensions/lastfm) | Browse charts, weekly, library and search; artist pages; keywords on every row |
| [`downloads-manager`](downloads-manager/) | [thomas/downloads-manager](https://github.com/raycast/extensions/tree/main/extensions/downloads-manager) | Upstream deploy. 7 commands, 9 settings, list and grid. Moves files to the trash through `gio`; Vicinae's `trash()` is `rm -r` |
| [`vim-bro`](vim-bro/) | [ajaypremshankar/vim-bro](https://github.com/raycast/extensions/tree/main/extensions/vim-bro) | 181 vim commands in 12 groups from a local JSON. No network |
| [`markdown`](markdown/) | [ning_cao_cabeza/markdown-to-rich-text](https://github.com/raycast/extensions/tree/main/extensions/markdown-to-rich-text) + [treyg/webpage-to-markdown](https://github.com/raycast/extensions/tree/main/extensions/webpage-to-markdown), merged fork | Markdown to rich text, and a web page to Markdown. The second needs a Jina key |
| [`bible`](bible/) | [josmithua/bible](https://github.com/raycast/extensions/tree/main/extensions/bible) | Passage search across 233 versions; Russian book names are translated before the query, chapter numbering stays the site's |
| [`url-kit`](url-kit/) | [huzef44/url-tools](https://github.com/raycast/extensions/tree/main/extensions/url-tools) + [Visual-Studio-Coder/url-shortener](https://github.com/raycast/extensions/tree/main/extensions/url-shortener), merged fork | Encode, decode and shorten a URL (TinyURL, no key); text to QR code |
| [`cron-kit`](cron-kit/) | [niall-maloney/cron-description](https://github.com/raycast/extensions/tree/main/extensions/cron-description) + [tahazahit/cron-manager](https://github.com/raycast/extensions/tree/main/extensions/cron-manager), merged fork | Crontab listing with a parsed description per entry, and an expression explainer |
| [`in-the-time-zone`](in-the-time-zone/) | [i_idz/in-the-time-zone](https://github.com/raycast/extensions/tree/main/extensions/in-the-time-zone) | Several time zones at once from local IANA data |
| [`shell-history`](shell-history/) | [koinzhang/shell-history](https://github.com/raycast/extensions/tree/main/extensions/shell-history) | Search zsh, bash and fish history; masks secrets |
| [`tempmail`](tempmail/) | [Joshlucpoll/tempmail](https://github.com/raycast/extensions/tree/main/extensions/tempmail) + [AhmadRun/temp-mail](https://github.com/AhmadRun/temp-mail) (Omarchy bar widget), merged | Disposable mailbox via `mail.tm`: 10/30-minute address, countdown, verification codes copied from the mail, background notification and expiry |
| [`vectis`](vectis/) | [blackcityskyline/vectis](https://github.com/blackcityskyline/vectis), the daemon and CLI this front-ends | Power profiles, a hard TDP cap and GPU mode switching. Needs the vectis CLI |
| [`wallhaven`](wallhaven/) | [devadathanmb/wallhaven](https://github.com/raycast/extensions/tree/main/extensions/wallhaven) | Wallpaper search, preview and apply through the running backend's own interface |
| [`webapp-maker`](webapp-maker/) | [umedbazarov/webapp-maker](https://github.com/noctalia-dev/noctalia-plugins/tree/main/webapp-maker) (Noctalia plugin, koyaa-plugins fork), fork | Create, manage and remove Chromium web apps as desktop entries with `--app` |
| [`little-chrome`](little-chrome/) | [tompenguin/little-chrome](https://github.com/raycast/extensions/tree/a3c38767c50d11db6bc3e489615bff315b2d8058/extensions/little-chrome), fork | A URL or a search in a small chromeless window, with suggestions from the browser's own history. `Copy Chrome URL` and `Open in Current Tab` are cut; see [`docs/audits/little-chrome.md`](docs/audits/little-chrome.md) |
| [`default-apps`](default-apps/) | [thaer99ob/default-apps](https://github.com/noctalia-dev/community-plugins/tree/main/default-apps), fork | View and change default applications for MIME types and schemes via `xdg-mime` |
| [`lucide-icons`](lucide-icons/) | [Sn0wye/lucide-icons](https://github.com/raycast/extensions/tree/main/extensions/lucide-icons), fork | Search the Lucide set; copy name, SVG or component tag; tint the grid from a colour dropdown |
| [`material-icons`](material-icons/) | [creasty/material-icons](https://github.com/raycast/extensions/tree/main/extensions/material-icons), fork | Search Material Icons across five styles; copy name, codepoint or SVG; download PNG, SVG, Android and iOS assets |
| [`iskra`](iskra/) | [JaINTP/vscrot](https://github.com/vicinaehq/extensions/tree/main/extensions/vscrot) (`vicinaehq/extensions`), fork | Screenshots through whichever tool the session can drive, with annotators, OCR and QR scanning. Capture tools and annotators are preference-ordered |
| [`gpu-screen-recorder`](gpu-screen-recorder/) | [lufimio/gpu-screen-recorder](https://github.com/vicinaehq/extensions/tree/main/extensions/gpu-screen-recorder) (`vicinaehq/extensions`), MIT | Recording, instant replay, quality and audio sources. No self-checks yet |
| [`dpaste`](dpaste/) | written from scratch; one command in place of [vimtor/pastebin](https://github.com/raycast/extensions/tree/main/extensions/pastebin)'s two | Paste from the clipboard or typed text. No account; the link replaces the clipboard. One command, because anonymous pastes cannot be listed |
| [`timer`](timer/) | [HarshNarayanJha/raycast-timer](https://github.com/HarshNarayanJha/raycast-timer), fork | Background timers in natural language: presets, a repeated alarm, music from any source you name, and tasks started from a markdown timetable |
| [`audio-control`](audio-control/) | [rastsislaux/pulseaudio](https://github.com/vicinaehq/extensions/tree/main/extensions/pulseaudio) (`vicinaehq/extensions`) + [audio-switcher](https://noctalia.dev/plugins/community/audio-switcher) (Noctalia plugin), merged fork | Devices, streams and card profiles through `pactl`. Adds output groups (`module-combine-sink`), presets, a test sound and reconnect; inputs are not groupable |
| [`easyeffects`](easyeffects/) | [mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects), Omarchy plugin | Output presets, global bypass and the current output's battery through the `easyeffects` CLI. Theme matching is not ported |
| [`shutdown-timer`](shutdown-timer/) | [valerkaaa/omarchy-shutdown-timer](https://github.com/valerkaaa/omarchy-shutdown-timer), Omarchy plugin | Power off, reboot or suspend on a cancellable countdown: transient systemd user timers, warnings, dry run, history |
| [`wifi-commander`](wifi-commander/) | [dagimg-dot/wifi-commander](https://github.com/vicinaehq/extensions/tree/main/extensions/wifi-commander) (`vicinaehq/extensions`), fork | Wi-Fi radio on/off, restart, scan and connect, saved networks and their autoconnect. Replaces the store's bundled copy with upstream's sources |
| [`network-info`](network-info/) | [nertwork/omarchy-network-info](https://github.com/nertwork/omarchy-network-info) and [imzihuailin/speedtest-map](https://github.com/imzihuailin/speedtest-map), Omarchy plugins | Local and public IP, gateway ping, DNS, Wi-Fi details, live throughput, apps with open connections, and a speed test row |
| [`miho`](miho/) | written from scratch | Start, stop and inspect mihomo: proxy and TUN modes, node selection, provider quota, live connections, egress IP and log. Shares daemon and state with the CLI |
| [`iso-toolkit`](iso-toolkit/) | written from scratch | Boot an ISO via GRUB loopback or kexec, write and format USB drives, list devices and recent images |
| [`hypr`](hypr/) | [vicinaehq/extensions/hypr](https://github.com/vicinaehq/extensions/tree/main/extensions/hypr) and the Noctalia `hyprland-visual-editor` plugin, fork | Inspect monitors, workspaces, layers, windows and keybinds, switch layouts, and apply animation, border and shader presets |
| [`todo-list`](todo-list/) | [maggie/todo-list](https://github.com/raycast/extensions/tree/main/extensions/todo-list) | Daily todo list in `~/Documents/todo/<date>/todo.json`: tags, priority, due dates, pin, export and import |
| [`obsidian`](obsidian/) | [marcjulian/obsidian](https://github.com/raycast/extensions/tree/f1a99ca99ad516843787a211e78e160388c5b9f5/extensions/obsidian), Linux fork | Search, open, create and edit notes, bookmarks, daily notes, tasks, media and custom append actions. No menu-bar command; the caret jump needs the macOS-only Obsidian CLI |
| [`vicifetch`](vicifetch/) | written from scratch; reads `fastfetch` | Distribution logo beside OS, kernel, WM/DE, package count, shell and install age |
| [`yt-dlp`](yt-dlp/) | [Alibest69420/omarchy-ytdlp](https://github.com/Alibest69420/omarchy-ytdlp), Omarchy plugin | Audio (Opus, MP3, FLAC, M4A, WAV), video (MP4, MKV, WebM), thumbnail images and subtitle tracks (language and file format per job); per-job quality and folder, detached jobs, live progress, notifications |
| [`soren-idle`](soren-idle/) | [mikael_brostrom/soren-idle](https://github.com/raycast/extensions/tree/main/extensions/soren-idle), fork | A sci-fi idle game: tasks, gear, base, bounties, trade and prestige. The macOS menu-bar ticker is cut; progress catches up when you open the window. See [`docs/audits/soren-idle.md`](docs/audits/soren-idle.md) |
| [`yt-x`](yt-x/) | written from scratch; runs the installed [Benexl/yt-x](https://github.com/Benexl/yt-x) | Native port of yt-x 0.8.7's menus: feeds, library, playlists, channel tabs, inline search filters and `!n` recall, mix, playlist downloads with yt-x's archive, custom commands and subscription sync. Plays in the configured player, downloads with yt-dlp, writes yt-x's own state; legacy library files are read until the current ones exist. See [`docs/audits/yt-x.md`](docs/audits/yt-x.md) |
| [`ytmusic`](ytmusic/) | written from scratch; parsers ported from [sonorahq/ytmusic-rs](https://github.com/sonorahq/ytmusic-rs) | YouTube Music's home shelves, charts, moods, genres, albums, artists, playlists, search filters and — with cookies — library, history and liked songs through its InnerTube client; the session comes from Sonora or a signed-in browser. One shared mpv with a queue you can switch inside, shuffle, repeat, volume, cover art and a Now Playing view, headless or windowed; the main menu previews each page's content. MP3s with yt-dlp. See [`docs/audits/ytmusic.md`](docs/audits/ytmusic.md) |
| [`monochrome`](monochrome/) | written from scratch; endpoints measured against their web client | Monochrome's lossless FLAC catalog: search as you type (tracks, albums, artists, PodcastIndex podcasts), play a track, an album or a discography through a shared mpv with queue, volume and a Now Playing view, and save the same FLAC files to disk. Signs in to the account server that their Tauri app cannot reach, because the allow-list only names `https://monochrome.st`; the session lives in `LocalStorage`. No yt-dlp. See [`docs/audits/monochrome.md`](docs/audits/monochrome.md) |
| [`transmission`](transmission/) | [raycast/extensions/extensions/transmission](https://github.com/raycast/extensions/tree/main/extensions/transmission), port | Torrents through the daemon's own RPC: list with progress and speeds, start, stop, add a magnet or a `.torrent` file, remove with or without the files. No client library — the 409 handshake and the add trap are handled directly |
| [`neovim`](neovim/) | [raycast/extensions/extensions/neovim](https://github.com/raycast/extensions/tree/main/extensions/neovim), port | Saved `persistence.nvim` sessions, the `lazy.nvim` plugin list with measured repository URLs, and the config's normal-mode keymaps read through one headless run. The terminal is Vicinae's own; `open-with-neovim` is cut, there is no file selection to read |
| [`ffmpeg`](ffmpeg/) | [raycast/extensions/extensions/ffmpeg](https://github.com/raycast/extensions/tree/main/extensions/ffmpeg), port | One `ffprobe` run over a picked file (prefilled from the clipboard when it holds a path): container, size, duration, bitrate, then a section per stream with codec, resolution, frame rate, sample rate and channels. A still image reads as an image. Conversions, thumbnails and metadata writing are cut; the Finder selection it read does not exist in Vicinae, so the input is a picker |
| [`appimage-manager`](appimage-manager/) | [bmaltais/StartAppImage](https://github.com/bmaltais/StartAppImage), Omarchy plugin | Install from a file, a URL or a GitHub release, then open, update, configure or remove AppImages. Its 886-line bash CLI ships in `assets/` and does the work, including adopting entries another launcher wrote; reading an image needs `unsquashfs` |

## Working on an extension

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension && npm install && npm run dev
```

`npm run build` type-checks, bundles and installs into
`~/.local/share/vicinae/extensions`; Vicinae need not restart. Remove an extension by
deleting its directory there. Launch a command with
`vicinae 'vicinae://launch/@<author>/<name>/<command>'`; the `@<author>` prefix from the
manifest is required.

## Documentation

`docs/` and [AGENTS.md](AGENTS.md) are written for coding agents; AGENTS.md holds the binding
rules and the reading order.

- [`docs/engineering.md`](docs/engineering.md): process, tests, code quality, structure, security, commits
- [`docs/authoring-extensions.md`](docs/authoring-extensions.md): writing an extension from scratch
- [`docs/api-porting.md`](docs/api-porting.md): Raycast to Vicinae differences
- [`docs/definition-of-done.md`](docs/definition-of-done.md): completion checklist
- [`docs/audits/`](docs/audits): measurements behind extensions that needed more than a manifest rewrite
- [`ROADMAP.md`](ROADMAP.md): what is considered next

The review standard is [`vicinaehq/extensions`](https://github.com/vicinaehq/extensions)
(`skills/extension-reviewer/rules.json`). Nothing is published to the store.
