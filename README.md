# vicinae-extensions

Personal [Vicinae](https://vicinae.com) extensions. One directory per extension;
each is a standalone package that builds and installs itself into
`~/.local/share/vicinae/extensions`.

Extensions here are written from scratch, ported from Raycast, or both.

## Extensions

| Directory   | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `bitwarden` | Bitwarden vault search, TOTP codes and password generation. Linux fork of the Raycast extension. |

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
