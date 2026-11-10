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
| [`default-apps`](default-apps/) | [thaer99ob/default-apps](https://github.com/noctalia-dev/community-plugins/tree/main/default-apps), fork | View and change default applications for MIME types and schemes via `xdg-mime` |
| [`lucide-icons`](lucide-icons/) | [Sn0wye/lucide-icons](https://github.com/raycast/extensions/tree/main/extensions/lucide-icons), fork | Search the Lucide set; copy name, SVG or component tag; tint the grid from a colour dropdown |
| [`material-icons`](material-icons/) | [creasty/material-icons](https://github.com/raycast/extensions/tree/main/extensions/material-icons), fork | Search Material Icons across five styles; copy name, codepoint or SVG; download PNG, SVG, Android and iOS assets |
| [`iskra`](iskra/) | [JaINTP/vscrot](https://github.com/vicinaehq/extensions/tree/main/extensions/vscrot) (`vicinaehq/extensions`), fork | Screenshots through whichever tool the session can drive, with annotators, OCR and QR scanning. Capture tools and annotators are preference-ordered |
| [`gpu-screen-recorder`](gpu-screen-recorder/) | [lufimio/gpu-screen-recorder](https://github.com/vicinaehq/extensions/tree/main/extensions/gpu-screen-recorder) (`vicinaehq/extensions`), MIT | Recording, instant replay, quality and audio sources. No self-checks yet |
| [`dpaste`](dpaste/) | written from scratch; one command in place of [vimtor/pastebin](https://github.com/raycast/extensions/tree/main/extensions/pastebin)'s two | Paste from the clipboard or typed text. No account; the link replaces the clipboard. One command, because anonymous pastes cannot be listed |
| [`timer`](timer/) | [HarshNarayanJha/raycast-timer](https://github.com/HarshNarayanJha/raycast-timer), fork | Background timers in natural language: presets, a repeated alarm, and music from any source you name while a timer runs |
| [`audio-control`](audio-control/) | [rastsislaux/pulseaudio](https://github.com/vicinaehq/extensions/tree/main/extensions/pulseaudio) (`vicinaehq/extensions`) + [audio-switcher](https://noctalia.dev/plugins/community/audio-switcher) (Noctalia plugin), merged fork | Devices, streams and card profiles through `pactl`. Adds output groups (`module-combine-sink`), presets, a test sound and reconnect; inputs are not groupable |
| [`easyeffects`](easyeffects/) | [mr-dragon9/omarchy-easyeffects](https://github.com/mr-dragon9/omarchy-easyeffects), Omarchy plugin | Output presets, global bypass and the current output's battery through the `easyeffects` CLI. Theme matching is not ported |
| [`shutdown-timer`](shutdown-timer/) | [valerkaaa/omarchy-shutdown-timer](https://github.com/valerkaaa/omarchy-shutdown-timer), Omarchy plugin | Power off, reboot or suspend on a cancellable countdown: transient systemd user timers, warnings, dry run, history |
| [`wifi-commander`](wifi-commander/) | [dagimg-dot/wifi-commander](https://github.com/vicinaehq/extensions/tree/main/extensions/wifi-commander) (`vicinaehq/extensions`), fork | Wi-Fi radio on/off, restart, scan and connect, saved networks and their autoconnect. Replaces the store's bundled copy with upstream's sources |
| [`network-info`](network-info/) | [nertwork/omarchy-network-info](https://github.com/nertwork/omarchy-network-info) and [imzihuailin/speedtest-map](https://github.com/imzihuailin/speedtest-map), Omarchy plugins | Local and public IP, gateway ping, DNS, Wi-Fi details, live throughput, apps with open connections, and a speed test row |
| [`miho`](miho/) | written from scratch | Start, stop and inspect mihomo: proxy and TUN modes, node selection, provider quota, live connections, egress IP and log. Shares daemon and state with the CLI |
| [`iso-toolkit`](iso-toolkit/) | written from scratch | Boot an ISO via GRUB loopback or kexec, write and format USB drives, list devices and recent images |
| [`hypr`](hypr/) | [vicinaehq/extensions/hypr](https://github.com/vicinaehq/extensions/tree/main/extensions/hypr) and the Noctalia `hyprland-visual-editor` plugin, fork | Inspect monitors, workspaces, layers, windows and keybinds, switch layouts, and apply animation, border and shader presets |
| [`todo-list`](todo-list/) | [maggie/todo-list](https://github.com/raycast/extensions/tree/main/extensions/todo-list) | Daily todo list in `~/Documents/todo/<date>/todo.json`: tags, priority, due dates, pin, export and import |
| [`vicifetch`](vicifetch/) | written from scratch; reads `fastfetch` | Distribution logo beside OS, kernel, WM/DE, package count, shell and install age |

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
