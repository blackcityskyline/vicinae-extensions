# vicinae-extensions

Personal [Vicinae](https://vicinae.com) extensions. One directory per extension; each is a
standalone package that builds and installs itself into `~/.local/share/vicinae/extensions`.

Extensions here are written from scratch, ported from Raycast, or deployed from Raycast untouched
when the runtime can already run them. The middle option is the usual one: Vicinae resolves
`@raycast/api` and `@raycast/utils` at runtime, so a Raycast extension's own source often runs as
written and only its manifest needs rewriting.

## Extensions

| Directory | Source | What it is |
| --------- | ------ | ---------- |
| `bitwarden` | Linux fork | Vault search, TOTP and password generation. The reference implementation for this repo |
| `github` | `raycast/extensions` | Repository search, issues, pull requests, workflows and notifications. Replaces the store's thinner `github` |
| `google-translate` | `raycast/extensions` | Deployed unchanged. Adds the dictionary, alternatives and definitions the reference receives and drops, to the form |
| `lastfm` | `raycast/extensions` | Adds Browse (charts, weekly, library, search), an artist page the reference does not have, and `keywords` on every row |
| `downloads-manager` | `thomas/downloads-manager` | Deployed — 7 commands, 9 settings, list and grid. Moves to the trash through `gio`, because Vicinae's `trash()` is `rm -r` |
| `vim-bro` | `ajaypremshankar/vim-bro` | 181 vim commands in 12 groups, from a JSON in the repository. Needs no network |
| `markdown` | two upstreams merged | Markdown to rich text, and a web page to Markdown. The second needs a Jina API key |
| `bible` | `josmithua/bible` | Passage search across 233 versions including the Russian Synodal. The reference is typed in English — Bible Gateway takes no Russian book names |
| `url-kit` | two upstreams merged | URL manipulation and a keyless shortener |
| `cron-kit` | two upstreams merged | Crontab listing with a parsed description per entry, and expression explainer |
| `in-the-time-zone` | `i_idz/in-the-time-zone` | Several time zones at once. IANA data is local, so no network |
| `shell-history` | `koinzhang/shell-history` | Search across zsh, bash and fish. Masks secrets in the output |
| `tempmail` | `Joshlucpoll/tempmail` | Disposable mailbox via `mail.gw`. No key needed |
| `vectis` | `vectisd` | Power profiles, a hard TDP cap and GPU mode switching. Needs the vectis CLI installed |
| `wallhaven` | `devadathanmb` | Wallpaper search, preview and apply. Detects the running wallpaper backend and drives it through its own interface |

## Working on an extension

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension
npm install
npm run dev     # hot reload; extension logs print here
```

A successful `npm run build` is the install. Vicinae does not need restarting.

To remove an extension, delete its directory under `~/.local/share/vicinae/extensions/`.

## Launching a command directly

Local extensions are addressed by `@<author>/<name>/<command>`:

```bash
vicinae 'vicinae://launch/@black/bitwarden/search'
```

The author comes from the manifest. The prefix is required.

## Documentation

`docs/` is written for coding agents; see [AGENTS.md](AGENTS.md) for the reading order and the
entry point.

- [`docs/engineering.md`](docs/engineering.md) — process: plan first, test first, code quality, structure
- [`docs/authoring-extensions.md`](docs/authoring-extensions.md) — writing an extension from scratch
- [`docs/api-porting.md`](docs/api-porting.md) — Raycast to Vicinae differences
- [`docs/definition-of-done.md`](docs/definition-of-done.md) — completion checklist
- [`docs/monochrome.md`](docs/monochrome.md) — monochrome.tf: measured endpoints, deep links, traps
- [`docs/audits/`](docs/audits) — one file per extension that needed more than a manifest rewrite

`ROADMAP.md` lists what is done, what is next and what was closed. `UNVERIFIED.md` lists what was
never checked by eye.

## Quality bar

The completion checklist is derived from the review rules the Vicinae extension maintainers apply in
[`vicinae/extensions`](https://github.com/vicinaehq/extensions)
(`skills/extension-reviewer/rules.json`). Nothing is published to the store, but those rules are
the only written standard for this ecosystem, so they are adopted here. The ones that bite most
often:

- Do not reimplement what `@vicinae/api` already provides (API-001) — prefer the builtin fuzzy
  filter, `Clipboard.paste` and `getFrontmostApplication` over shelling out to `wl-copy`/`wtype`/
  `xdotool`.
- All user-facing strings must be English (UX-003).
- No dead, minified or generated code in `src/` (QUALITY-001).
- Never pass a secret in `argv`; it is readable from `/proc` (SECURITY-003).