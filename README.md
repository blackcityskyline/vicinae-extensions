# vicinae-extensions

Personal Vicinae extensions. One directory per extension; each is a standalone
package that builds and installs itself into `~/.local/share/vicinae/extensions`.

## Extensions

| Directory   | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `bitwarden` | Bitwarden vault search, TOTP codes and password generation. Linux fork of the Raycast extension. |

## Working on an extension

```bash
cd <extension>
npm install
npm run dev     # hot reload; extension logs print here
npm run build   # type-check and install
```

Builds do not require restarting Vicinae.

`dev` mode is the one to use while iterating: it rebuilds on save and streams
the extension's `console` output to the terminal.

## Launching a command directly

Local extensions are addressed by `@<author>/<name>/<command>`:

```bash
vicinae 'vicinae://launch/@black/bitwarden/search'
```

## Publishing to the store

`vicinae/extensions` on GitHub accepts extensions via pull request. The review
rules are in `skills/extension-reviewer/SKILL.md` there; the ones that most often
bite are:

- Do not reimplement what `@vicinae/api` already provides (rule API-001,
  blocking) — prefer the built-in fuzzy filter, `Clipboard.paste`,
  `getFrontmostApplication` over shelling out to `wl-copy`/`wtype`/`xdotool`.
- All user-facing strings must be English (UX-003, blocking).
- `package-lock.json` is required and CI validates the manifest.
- No dead, minified or generated code in `src/` (QUALITY-001).
