# AGENTS.md

Guidance for coding agents working in this repository.

## What this repo is

A collection of personal [Vicinae](https://vicinae.com) extensions, one directory
each. Every extension is a self-contained npm package that builds and installs
itself; nothing is shared between them at runtime.

## Layout

```
AGENTS.md               this file
README.md               human-facing overview
docs/
  api-porting.md        Raycast -> Vicinae API differences; read before porting
  definition-of-done.md pre-publish checklist, mapped to store review rules
templates/extension/    minimal extension that already passes lint + build
scripts/new-extension   scaffolder
bitwarden/              reference implementation
```

## Start here

**New extension:**

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension && npm install && npm run dev
```

**Porting an existing Raycast extension:** read `docs/api-porting.md` first. It
lists every API difference that actually breaks a build, plus the ten Raycast
icons Vicinae does not have.

**Look at `bitwarden/`** for a real port. It contains the patterns this repo
prefers: a thin CLI wrapper, a self-check test, and a shim for missing icons.

## Commands

Run these from inside an extension directory.

| Command         | Does                                                        |
| --------------- | ----------------------------------------------------------- |
| `npm run dev`   | Builds, installs, watches for changes, streams `console` output |
| `npm run build` | Type-checks, bundles, installs into `~/.local/share/vicinae/extensions` |
| `npm run lint`  | Validates the manifest against Vicinae's schema             |
| `npm run check` | `tsc --noEmit` with `noUnusedLocals`                        |
| `npm test`      | Self-check scripts (see below)                              |

There is no separate install step: a successful `build` **is** the install.
Restarting Vicinae is not required.

## Hard-won constraints

These cost real debugging time. Treat them as fixed.

**Never run `npm init` in an extension directory.** It rewrites the `contributors`
array into an object and drops `title` from checkbox preferences, after which
manifest validation fails. Edit `package.json` by hand instead.

**A checkbox preference needs both `label` and `title`.** `label` is the visible
checkbox text, `title` is the settings-group heading. Omitting either fails
`vici lint`.

**Every command in the manifest needs an entrypoint file** at
`src/<command-name>.tsx` (or `.ts`/`.js`/`.jsx`).

**Manifest rules** enforced by `vici lint`: `license` must be exactly `MIT`;
`author` matches `^[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*$`; `name` is a slug of at
least 3 characters; `description` is at least 16 characters; every preference
needs `name`, `title`, `description` and `required`.

**`tsconfig.json` must include `vicinae-env.d.ts`.** It is generated from the
manifest by `vici build` and is where the `Preferences` and `Arguments` global
types come from. Without it, every `getPreferenceValues<Preferences>()` fails to
type-check.

**Never reimplement what `@vicinae/api` provides.** Store rule API-001 is
blocking. Concretely: use `Clipboard.paste` rather than `wtype`/`xdotool`,
`getFrontmostApplication` rather than querying the compositor, `Cache` rather
than a hand-rolled LRU, and the builtin fuzzy `List` filter rather than
`fast-fuzzy` or `fuse.js`. Drive the builtin filter through each
`List.Item`'s `keywords` prop.

**User-facing strings must be English.** Store rule UX-003 is blocking. This
applies to titles, placeholders, action labels, toasts and error messages —
not to identifiers, paths, URLs or imported data.

**No dead code.** Store rule QUALITY-001. An exported function with no callers,
an import kept alive to justify itself, or a commented-out block all get
flagged. `npm run check` catches unused locals; it does not catch unused
*exports*, so grep before you keep one.

## Testing

Vicinae has no test runner and no DOM, so tests are plain scripts under
`test/`, run with `tsx` and exiting non-zero on failure. Follow
`templates/extension/test/example.test.ts`.

Write one for any module with real logic — parsing, crypto, formatting, date
handling. Verify crypto against published test vectors rather than against
itself. `bitwarden/test/totp.test.ts` checks TOTP against the RFC 6238 vectors
and is the model to copy.

Import with an explicit `.ts` extension; `allowImportingTsExtensions` is on.

## Testing changes for real

Compiling is not running. After a change:

```bash
npm run build
vicinae 'vicinae://launch/@black/<extension>/<command>'
```

Local extensions are addressed as `@<author>/<name>/<command>`. Read the
extension's output with `npm run dev` in another terminal, or
`vicinae logs -f`.

A command that needs credentials or a logged-in tool cannot be exercised
headlessly. Say so explicitly in the final report rather than implying the UI
was verified.

## Store review rules

`docs/definition-of-done.md` maps the checklist to the rule IDs in
`vicinae/extensions/skills/extension-reviewer/rules.json`. Read it before
proposing a port for publication.

## Conventions

- TypeScript, `strict` and `noUncheckedIndexedAccess` on.
- Import across the extension with the `~/` alias, which maps to `src/`.
- Prefer the platform's own primitives over dependencies. Adding a package to
  reimplement something in the standard library or in `@vicinae/api` is
  flagged as DEPENDENCY-001.
- Format with your editor's default; there is no enforced formatter in this
  repo, so do not add one.
