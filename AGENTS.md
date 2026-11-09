# AGENTS.md

Rules for coding agents in this repo. Binding; `docs/` has the detail.

## What is this?

Personal [Vicinae](https://vicinae.com) extensions, one directory each. Every
extension is a standalone npm package that builds and installs itself into
`~/.local/share/vicinae/extensions`; nothing is shared at runtime. Extensions are
written from scratch, ported from Raycast, or deployed from Raycast with only the
manifest rewritten.

## Repo structure

- `<extension>/` — `src/`, `test/`, `package.json`, `README.md`.
- `docs/` — engineering, definition of done, authoring, porting.
- `docs/audits/` — measurements taken against real services and the real runtime.
- `scripts/` — `new-extension`, `test-all`.
- `templates/extension/` — the scaffold; `bitwarden/` is the structure reference.
- `README.md` — the extension list.

## Reading order

- `docs/engineering.md` — before the first edit.
- `docs/definition-of-done.md` — before saying anything is finished.
- `docs/authoring-extensions.md` — new extension or command.
- `docs/api-porting.md` — porting, or when `@vicinae/api` surprises you.
- `docs/audits/` — read the audit for the extension before changing what it
  measured. Names that do not match the directory: `github-raycast.md` (GitHub),
  `hyprcapture.md` (iskra), `temp-mail.md` (tempmail), `speedtest.md` (Network
  Info's speed row).

## Rules

- Keep it simple.
- Do not edit code in response to a question.
- Never commit, push, or open a PR unless asked.
- Point out glaring issues we missed.
- Vicinae runs all day: audit every change for idle CPU, extra processes, timers
  and retained memory.
- Understand before you edit: read the real `.d.ts`, grep for an existing
  solution, state the plan and the verification. Several `@vicinae/api`
  signatures differ from Raycast in ways the compiler does not explain.
- Fix causes, not symptoms. Find every caller before changing a shared function.
  Never mix a refactor with a behaviour change.
- Delete rather than abstract. No interface with one implementation, no dead or
  commented-out code, no unused exports (`tsc` does not catch them: grep), no
  configuration that never varies, no dependency for a few lines.
- Stay in scope. Do not reformat, rename or "improve" neighbouring code; do not
  add dependencies, files or documents the task did not call for. Out of scope
  problems go in the report, not the diff.
- Do not guess facts. Endpoints, flags and response shapes are measured or read
  from source, not recalled. When a measurement is impossible here, say so.
- Documentation is part of the change: fix a false README, doc or manifest
  description in the same commit. Do not write a doc that restates what the code
  or `ls` already says.
- Never report a check that was not run. Compiling is not running; a screenshot
  is not the action being pressed.
- Secrets never leave the process environment: not in `argv`, logs, toasts,
  commits, docs or tests. A handed credential is used for its task, not written
  to disk, not echoed.
- Irreversible actions need the owner's word: force-pushes, deleting branches or
  published history, anything that touches data outside this repository.
- User-facing strings are English: titles, placeholders, actions, toasts,
  errors. Imported data, identifiers, paths and URLs are exempt.

## Tests

- A test must fail on the broken code. Otherwise do not write it.
- A bug fix ships with a check that fails without it.
- Assert against an external authority (RFC vectors, the real tool's output), not
  the code under test.
- No useless tests: existence checks, defaults, behaviour the change did not
  touch, or a check that cannot fail.
- A module that imports `@vicinae/api` cannot be loaded headless; keep testable
  logic out of it.

## Build and verify

From the extension directory:

```bash
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/<extension>/<command>'
```

- `npm run build` type-checks, bundles and installs. This is the install; Vicinae
  need not restart.
- `npm run dev` builds, installs, watches and streams `console`.
- `npm run check` is `tsc --noEmit` with `noUnusedLocals`.
- `npm test` runs the self-check scripts.
- `./scripts/test-all` runs every extension's tests (`--install` runs `npm ci`
  where `node_modules` is missing); CI runs it.
- Launch addresses use the manifest's author; without `@<author>` they do not
  resolve.
- After a launch, look for `Loaded extension <name>:<command>` in `vicinae logs`
  with no error after it. The log replays history; filter by time.
- Remove an extension with `rm -rf ~/.local/share/vicinae/extensions/<name>`.

## New extension or port

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
```

- Check first whether upstream runs as it stands. Vicinae resolves `@raycast/api`
  and `@raycast/utils` at runtime, so a Raycast extension may run with only
  `platforms`, scripts and `author` rewritten. Deploy it that way and patch only
  measured breakage. A 1400-line port of `google-translate` never showed a
  translation; upstream ran on the first try (`docs/audits/translate.md`).
- When a port is needed, write the audit before the port: command, dependency and
  generated-code counts against upstream, every cut with its reason, every fix
  with its measurement. `docs/audits/github-raycast.md` is the model.

## Vicinae traps

- Never run `npm init` in an extension: it rewrites `contributors` to an object
  and drops checkbox `title`. Edit `package.json` by hand.
- Manifest (`vici lint`): `license` is exactly `MIT`; `author` matches
  `^[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*$`; `name` is a slug of 3+ characters;
  `description` is 16+ characters; every preference has `name`, `title`,
  `description` and `required`; a checkbox needs `label` and `title`.
- Every command needs `src/<command-name>.tsx`; without it the command is
  silently absent.
- `tsconfig.json` must include `vicinae-env.d.ts`, which `vici build` generates
  (git-ignored). It types the global `Preferences` and `Arguments`, and
  `npm run check` fails before the first build.
- The injected `@raycast/api` is not the published one: an absent `LocalStorage`
  key is `null`, so `value ?? []`, never `= []`.
- A `no-view` command has no clipboard: `Clipboard.readText()` returns `""`.
  Reading commands are `view` commands that prefill a field.
- Do not reimplement `@vicinae/api`: `Clipboard.paste`, not `wtype`/`xdotool`;
  `getFrontmostApplication`, not a compositor query; `Cache`, not a hand-rolled
  LRU; the builtin `List` filter with `keywords`, not `fast-fuzzy`.
- Every action needs a shortcut. A generic verb uses the named form
  (`shortcut="open"`, not a literal `ctrl+o`) so the user's `keybinds` drive it;
  `Keyboard.Shortcut.Common.*` is typed `string` and fails `tsc`. A domain verb
  takes its own `ctrl+…` that avoids the launcher's keys. Table, defaults and the
  id quirks: `docs/authoring-extensions.md` → Keybindings.
- `trash()` is `rm -r`. Use `gio trash`.
- Driving another app by keystrokes is not portable: nothing can check the focus,
  so a miss types into the wrong window and reports nothing.
- The manifest `title` repeats on every command row. Keep it plain (`GitHub`);
  attribution goes in the README and `contributors`.
- Replace the template placeholder icon (512×512) before building a new
  extension. It is deliberately not any product's logo.

## Conventions

- TypeScript with `strict` and `noUncheckedIndexedAccess`.
- `~/` aliases `src/`.
- `utils/` and `api/` never import `components/`. `utils/` is pure: no React, no
  I/O unless I/O is the module's whole job.
- Standard library first, then the platform, then an existing dependency, then new
  code. No shared runtime packages between extensions; duplication beats hidden
  coupling.
- No formatter is enforced and none is to be added. Match the surrounding style.

## Commit messages

`area: short lowercase explanation`, for example `miho: sort failed checks last`.
A description only when it explains why.
