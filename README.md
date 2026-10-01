# vicinae-extensions

Personal [Vicinae](https://vicinae.com) extensions. One directory per extension;
each is a standalone package that builds and installs itself into
`~/.local/share/vicinae/extensions`.

Extensions here are written from scratch, ported from Raycast, or deployed from
Raycast untouched when the runtime can already run them.

## Extensions

| Directory        | Description |
| ---------------- | ----------- |
| `bitwarden`      | Vault search, TOTP and password generation. Linux fork of the Raycast extension. |
| `github` | Repository search, issues, pull requests, workflows and notifications. Port of the Raycast extension, replacing the store's thinner `github`. |
| `downloads-manager` | Upstream `raycast/extensions`, deployed — 7 commands, 9 settings, list and grid. Moves to the trash through `gio`, because Vicinae's `trash()` is `rm -r`. |
| `google-translate` | Upstream `raycast/extensions`, deployed unchanged — three files differ. Adds the dictionary, alternatives and definitions the reference receives and drops, to the form. |
| `lastfm` | Upstream `raycast/extensions`, deployed — adds Browse (charts, weekly, library, search), an artist page the reference does not have, and `keywords` on every row. |
| `vectis` | Power profiles, a hard TDP cap and GPU mode switching, through the `vectisd` daemon. Needs the vectis CLI installed. |

## Working on an extension

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension
npm install
npm run dev     # hot reload; extension logs print here
```

A successful `npm run build` is the install. Vicinae does not need restarting.

`npm run dev` is the one to use while iterating: it rebuilds on save and streams
the extension's `console` output to the terminal.

To remove an extension, delete its directory under
`~/.local/share/vicinae/extensions/`.

## Launching a command directly

Local extensions are addressed by `@<author>/<name>/<command>`:

```bash
vicinae 'vicinae://launch/@black/bitwarden/search'
```

The author comes from the manifest. The prefix is required.

## Documentation

`docs/` is written for coding agents; see [AGENTS.md](AGENTS.md) for the reading
order and the entry point.

- [`docs/engineering.md`](docs/engineering.md) — process: plan first, test first, code quality, structure
- [`docs/authoring-extensions.md`](docs/authoring-extensions.md) — writing an extension from scratch
- [`docs/api-porting.md`](docs/api-porting.md) — Raycast to Vicinae differences
- [`docs/definition-of-done.md`](docs/definition-of-done.md) — completion checklist
- [`docs/monochrome.md`](docs/monochrome.md) — monochrome.tf: measured endpoints, deep links, traps
- [`docs/audits/translate.md`](docs/audits/translate.md) — the Google Translate endpoint, measured
- [`docs/audits/github-raycast.md`](docs/audits/github-raycast.md) — what was cut from the GitHub port, and why

## Quality bar

The completion checklist is derived from the review rules the Vicinae extension
maintainers apply in
[`vicinae/extensions`](https://github.com/vicinaehq/extensions)
(`skills/extension-reviewer/rules.json`). Nothing is published to the store, but
those rules are the only written standard for this ecosystem, so they are
adopted here. The ones that bite most often:

- Do not reimplement what `@vicinae/api` already provides (API-001) — prefer the
  builtin fuzzy filter, `Clipboard.paste` and `getFrontmostApplication` over
  shelling out to `wl-copy`/`wtype`/`xdotool`.
- All user-facing strings must be English (UX-003).
- No dead, minified or generated code in `src/` (QUALITY-001).
- Never pass a secret in `argv`; it is readable from `/proc` (SECURITY-003).
