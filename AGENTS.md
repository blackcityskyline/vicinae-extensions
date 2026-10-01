# AGENTS.md

Guidance for coding agents working in this repository.

## What this repo is

A collection of personal [Vicinae](https://vicinae.com) extensions, one directory
each. Every extension is a self-contained npm package that builds and installs
itself; nothing is shared between them at runtime.

Extensions here are developed from scratch, ported from Raycast, or both.

## Read these, in this order

| Document | When |
| -------- | ---- |
| `docs/engineering.md` | Always. Workflow, TDD, code quality, structure. |
| `docs/authoring-extensions.md` | Writing a new extension. Components, state, actions. |
| `docs/api-porting.md` | Porting a Raycast extension. Every API difference that breaks a build. |
| `docs/definition-of-done.md` | Before calling anything finished. |
| `docs/monochrome.md` | Anything touching monochrome.tf or monochrome.st. Measured endpoints, deep links, and the traps. |
| `docs/audits/translate.md` | Before touching the Google Translate endpoint. What answers, what does not, and the two things that are easy to get wrong. |
| `docs/audits/lastfm.md` | Before touching Last.fm. Every response member, verified one at a time. |
| `docs/audits/downloads-manager.md` | Before touching files or the trash. Why `trash()` cannot be used here. |
| `docs/audits/vim-bro.md` | Before touching `LocalStorage` from `@raycast/utils`. The runtime returns `null`, not `undefined`. |

`bitwarden/` is the reference implementation: a thin CLI wrapper, a self-check
test, an icon shim, and the structure the rest of the repo follows.

## Workflow

**1. Plan and analyse first.** Do not start editing. Read the actual `.d.ts` of
whatever API you intend to use rather than trusting memory — several of them
differ from Raycast in ways the compiler does not explain. Grep the repo for
something that already solves the problem. Then state the plan, the files, and
how you will verify it. Full rules in `docs/engineering.md`.

**2. Write the failing check** for anything with logic, before the
implementation.

**3. Implement.**

**4. Verify, then report honestly.** See [Verifying](#verifying). Say what you
checked and what you could not.

## Layout

```
AGENTS.md                    this file
README.md                    human-facing overview
docs/
  engineering.md             process: plan, TDD, quality, structure, security
  authoring-extensions.md    writing an extension from scratch
  api-porting.md             Raycast -> Vicinae differences
  definition-of-done.md      completion checklist
  monochrome.md              monochrome.tf / .st endpoints and deep links
  audits/
    github-raycast.md        why the GitHub port looks the way it does
    translate.md             the Google Translate endpoint, measured
    lastfm.md                every Last.fm response member, measured
    downloads-manager.md     the trash, and what does not survive the platform
    vim-bro.md               why an absent LocalStorage key is null, not undefined
templates/extension/         minimal extension; passes lint, build and test
scripts/new-extension         scaffolder
bitwarden/                   reference implementation
github/                     GitHub; see docs/audits/github-raycast.md
lastfm/                     upstream deployed; Browse, artist page, keywords added
google-translate/           upstream deployed; three files patched
downloads-manager/          upstream deployed; gio trash, keywords, shortcuts
vim-bro/                   upstream deployed; 181 commands, one runtime fix
vectis/                     power, TDP and GPU mode through vectisd
```

Start a new extension with:

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
cd my-extension && npm install && npm run dev
```

**Check first whether the original runs as it stands.** Vicinae resolves
`@raycast/api` and `@raycast/utils` at runtime — `github/` mixes `@vicinae/api` with
`@raycast/utils` — so a Raycast extension's own source may execute unmodified, with
only its manifest rewritten (`platforms`, build scripts, author). Deploy it that way
and patch only what is actually broken.

This is not a preference, it is what happened with `google-translate`. A 1400-line
port was written, its two list commands never showed a translation, and eleven
commits went into not finding out why — because it was not in the port. Upstream ran
first try. `docs/audits/translate.md` has the details.

Porting when a port is genuinely needed? Write the audit **before** the port.
Comparing command counts, dependency counts and generated-code volume against
upstream costs an afternoon and decides the shape of the whole job.
`docs/audits/github-raycast.md` is the model: every cut carries a reason, and
every fix carries the measurement that justified it.

## Commands

Run from inside an extension directory.

| Command         | Does                                                            |
| --------------- | --------------------------------------------------------------- |
| `npm run dev`   | Builds, installs, watches for changes, streams `console` output  |
| `npm run build` | Type-checks, bundles, installs into `~/.local/share/vicinae/extensions` |
| `npm run lint`  | Validates the manifest against Vicinae's schema                  |
| `npm run check` | `tsc --noEmit` with `noUnusedLocals`                             |
| `npm test`      | Self-check scripts                                               |

## Installing locally

Deployment in this repo means local install. There is no store submission.

A successful `npm run build` **is** the install. There is no separate deploy
step and Vicinae does not need restarting.

The installed directory is `~/.local/share/vicinae/extensions/<name>/` and holds
one bundle per command, `assets/`, and the manifest. It has no `node_modules`:
`@vicinae/api`, `react` and `@raycast/api` are resolved by the Vicinae runtime,
and Node built-ins come from Node.

| Task | Command |
| ---- | ------- |
| Install or update | `npm run build` |
| Iterate with reload | `npm run dev` |
| Remove | `rm -rf ~/.local/share/vicinae/extensions/<name>` |

Launch a command directly:

```bash
vicinae 'vicinae://launch/@<author>/<name>/<command>'
```

The `@<author>` prefix comes from the manifest's `author`. `vicinae://launch/<name>`
without the prefix does not resolve.

To move an extension to another machine, copy that installed directory, or
clone the repo and run `npm install && npm run build` there.

## Verifying

**Compiling is not running.** A clean type-check and a successful bundle say
nothing about whether a command renders.

```bash
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/<extension>/<command>'
```

Then confirm in `vicinae.log` that the extension loaded:

```bash
vicinae logs -f          # or read the npm run dev terminal
```

You are looking for `Loaded extension <name>:<command>` with no error after it.

Some commands cannot be exercised headlessly — anything needing credentials, a
logged-in external tool, or a GUI to interact with. When that is the case, say
so explicitly in the final report. Do not imply the UI was verified.

Never report a check that was not run, and never write a check that cannot fail.

## Hard-won constraints

These cost real debugging time. Treat them as fixed.

**Never run `npm init` in an extension directory.** It rewrites `contributors`
into an object and drops `title` from checkbox preferences, after which manifest
validation fails. Edit `package.json` by hand.

**A checkbox preference needs both `label` and `title`.** `label` is the visible
checkbox text, `title` is the settings-group heading. Omitting either fails
`vici lint`.

**Every command in the manifest needs an entrypoint** at
`src/<command-name>.tsx` (or `.ts`/`.js`/`.jsx`). A command listed in the
manifest with no file is silently absent at runtime.

**Manifest rules** enforced by `vici lint`: `license` must be exactly `MIT`;
`author` matches `^[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*$`; `name` is a slug of at
least 3 characters; `description` is at least 16 characters; every preference
needs `name`, `title`, `description` and `required`.

**The module Vicinae injects for `@raycast/api` is not the published one.** The npm
package coerces where the runtime does not — `LocalStorage.getItem` does `value ??
undefined` in `node_modules/@vicinae/api`, while the injected module returns
`Storage.get()` uncoerced. So an absent key is `null`, `JSON.parse(null)` is `null`, and a
destructuring default does not save you. Use `?? []`, never `= []`. See
`docs/audits/vim-bro.md`, where this crashed a command on every launch.

**`tsconfig.json` must include `vicinae-env.d.ts`.** `vici build` generates it
from the manifest, and it is where the `Preferences` and `Arguments` global types
come from. Without it in `include`, every `getPreferenceValues<Preferences>()`
fails to type-check. It is generated — keep it git-ignored.

**Never reimplement what `@vicinae/api` provides.** Concretely: `Clipboard.paste`
rather than `wtype`/`xdotool`, `getFrontmostApplication` rather than querying
the compositor, `Cache` rather than a hand-rolled LRU, and the builtin fuzzy
`List` filter rather than `fast-fuzzy`. Drive the builtin filter through
`keywords`.

**User-facing strings must be English.** Titles, placeholders, action labels,
toasts, error messages. Not identifiers, paths, URLs or imported data.

**No dead code.** An unused export, an import kept alive to justify itself, a
commented-out block. `npm run check` catches unused locals but *not* unused
exports — grep before keeping one.

**Replace the template's placeholder icon.** `templates/extension/assets/extension_icon.png`
is a neutral grey `>_` prompt, 512×512. It is deliberately not any product's
logo. An earlier revision of this repo shipped the Bitwarden logo there, and
`scripts/new-extension` copied it verbatim, so a new GitHub extension went out
under the Bitwarden shield. Copy the real mark in and check `file assets/icon.png`
reports 512×512 before building.

**The manifest `title` is what the launcher shows next to every command.** The
launcher renders `<command title> <extension title>`, so a title carrying
provenance — `GitHub (Raycast port)` — is repeated on all eleven rows. Keep the
title plain (`GitHub`) and put attribution in the README and in `contributors`.

## Conventions

- TypeScript, `strict` and `noUncheckedIndexedAccess` on.
- Cross-module imports use the `~/` alias, which maps to `src/`.
- Dependency direction is one way: `utils/` and `api/` never import from
  `components/`.
- `utils/` is pure — no React, no I/O unless I/O is the module's whole job.
- Prefer the standard library, then the platform, then an existing dependency,
  and only then new code.
- No shared runtime packages between extensions. Each is independent.
- No enforced formatter in this repo; do not add one. Match surrounding style.
