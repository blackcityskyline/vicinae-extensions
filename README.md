# vicinae-extensions

Personal [Vicinae](https://vicinae.com) extensions. One directory per extension; each is a
standalone package that builds and installs itself into `~/.local/share/vicinae/extensions`.

Extensions here are written from scratch, ported from Raycast, or deployed from Raycast untouched
when the runtime can already run them. The middle option is the usual one: Vicinae resolves
`@raycast/api` and `@raycast/utils` at runtime, so a Raycast extension's own source often runs as
written and only its manifest needs rewriting.

## Extensions

`Source` names the upstream(s). **Fork** means they were merged and corrected here;
without the word the upstream runs as deployed, with at most a manifest rewrite.

| Directory | Source | What it is |
| --------- | ------ | ---------- |
| `bitwarden` | `raycast/extensions` (`jomifepe`), Linux fork | Vault search, TOTP and password generation. The reference implementation for this repo |
| `github` | `raycast/extensions` | Repository search, issues, pull requests, workflows and notifications. Replaces the store's thinner `github` |
| `google-translate` | `raycast/extensions` | Deployed unchanged. Adds the dictionary, alternatives and definitions the reference receives and drops, to the form |
| `lastfm` | `raycast/extensions` | Adds Browse (charts, weekly, library, search), an artist page the reference does not have, and `keywords` on every row |
| `downloads-manager` | `thomas/downloads-manager` | Deployed — 7 commands, 9 settings, list and grid. Moves to the trash through `gio`, because Vicinae's `trash()` is `rm -r` |
| `vim-bro` | `ajaypremshankar/vim-bro` | 181 vim commands in 12 groups, from a JSON in the repository. Needs no network |
| `markdown` | `ning_cao_cabeza/markdown-to-rich-text` + `treyg/webpage-to-markdown`, merged fork | Markdown to rich text, and a web page to Markdown. The second needs a Jina API key |
| `bible` | `josmithua/bible` | Passage search across 233 versions including the Russian Synodal, plus a Random Passage command that opens a random chapter. Russian book names are translated before the query (`Иоанн 3:16` works), and a Russian version shows `Иоанна 3:16`; chapter numbering stays the site's (Psalms are offset) |
| `url-kit` | `huzef44/url-tools` + `Visual-Studio-Coder/raycast-url-shortener`, merged fork | Encode, decode and shorten a URL (TinyURL, no key); turn text into a QR code |
| `cron-kit` | `niall-maloney/raycast-extensions` + `tahazahit/cron-manager`, merged fork | Crontab listing with a parsed description per entry, and expression explainer |
| `in-the-time-zone` | `i_idz/in-the-time-zone` | Several time zones at once. IANA data is local, so no network |
| `shell-history` | `koinzhang/shell-history` | Search across zsh, bash and fish. Masks secrets in the output |
| `tempmail` | `Joshlucpoll/tempmail` | Disposable mailbox via `mail.gw`. No key needed |
| `vectis` | `vectisd` | Power profiles, a hard TDP cap and GPU mode switching. Needs the vectis CLI installed |
| `wallhaven` | `devadathanmb` | Wallpaper search, preview and apply. Detects the running wallpaper backend and drives it through its own interface |
| `lucide-icons` | `Sn0wye/lucide-icons`, fork | Search the Lucide set. Copy the name, the SVG or the component tag; tint the grid from a colour dropdown. Opens one page at a time |
| `material-icons` | `creasty/material-icons`, fork | Search Google's Material Icons across five styles. Copy the name, codepoint or SVG; download PNG/SVG/Android/iOS assets. Grid or list |
| `iskra` | `JaINTP/vscrot`, fork | Screenshots (area, window, monitor, all) through whichever tool the session can drive, with annotators, OCR and QR scanning from the screen. Window capture picks a window by title; the fallback order of capture tools and annotators is a preference |
| `gpu-screen-recorder` | `lufimio`, MIT | Control [GPU Screen Recorder](https://git.dec05eba.com/gpu-screen-recorder/): recording, instant replay, quality and audio sources. No self-checks yet |
| `dpaste` | written from scratch | Create a dpaste paste from the clipboard or typed text. No account; the link replaces the clipboard. One command, because anonymous pastes cannot be listed |
| `audio-control` | `vicinaehq/extensions` (`pulseaudio`) + `noctalia-koyaa-plugins/audio-switcher-plus`, merged fork | Devices, streams and card profiles through `pactl`. Adds output groups (`module-combine-sink`), saved group/volume presets, a test sound on a chosen output and output reconnect (Bluetooth disconnect/connect, wired re-assert). Paired Bluetooth devices stay visible with their connection state. Inputs are not groupable through `pactl` |

## Working on an extension

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension && npm install && npm run dev
```

`npm run build` type-checks, bundles and installs into
`~/.local/share/vicinae/extensions`; Vicinae need not restart. To remove an
extension, delete its directory there. A command is launched by
`vicinae 'vicinae://launch/@<author>/<name>/<command>'`; the `@<author>` prefix
(from the manifest) is required.

## Documentation

`docs/` and [AGENTS.md](AGENTS.md) are written for coding agents: AGENTS.md holds the
binding rules and the reading order.

- [`docs/engineering.md`](docs/engineering.md): process, tests, code quality, structure, security, commits
- [`docs/authoring-extensions.md`](docs/authoring-extensions.md): writing an extension from scratch
- [`docs/api-porting.md`](docs/api-porting.md): Raycast to Vicinae differences, and runtime facts
- [`docs/definition-of-done.md`](docs/definition-of-done.md): the completion checklist
- [`docs/audits/`](docs/audits): measurements behind the extensions that needed more than a manifest rewrite

[`ROADMAP.md`](ROADMAP.md) is the backlog of extensions considered next.

The completion checklist follows the review rules the Vicinae extension maintainers apply in
[`vicinaehq/extensions`](https://github.com/vicinaehq/extensions)
(`skills/extension-reviewer/rules.json`). Nothing is published to the store, but those rules are
the only written standard for this ecosystem.
