# AGENTS.md

Rules for coding agents working in this repository. They are binding; the
documents they point to are the detail.

## What this repo is

A collection of personal [Vicinae](https://vicinae.com) extensions, one directory
each. Every extension is a self-contained npm package that builds and installs
itself into `~/.local/share/vicinae/extensions`. Nothing is shared between
extensions at runtime. They are written from scratch, ported from Raycast, or
deployed from Raycast with only the manifest rewritten.

The extension list is in `README.md`. `templates/extension/` is the scaffold;
`bitwarden/` is the reference for structure.

## Read first

| Document | Read it |
| -------- | ------- |
| `docs/engineering.md` | Always, before the first edit. Process, tests, code quality, structure, security, commits. |
| `docs/definition-of-done.md` | Before saying anything is finished. |
| `docs/authoring-extensions.md` | Writing an extension or a command from scratch. |
| `docs/api-porting.md` | Porting from Raycast, or when `@vicinae/api` behaves unexpectedly. |

`docs/audits/` holds measurements taken against real services and the real
runtime. Read the one for an extension before you change what it measured:

| Audit | Before you touch |
| ----- | ---------------- |
| `github-raycast.md` | the GitHub extension's search, scopes or cuts |
| `translate.md` | the Google Translate endpoint |
| `lastfm.md` | any Last.fm call or response reader |
| `downloads-manager.md` | files or the trash (`trash()` is `rm -r`) |
| `vim-bro.md` | `LocalStorage` through `@raycast/utils` (absent key is `null`) |
| `tradingview-controls.md` | a proposal to port anything that drives another app by keystrokes |
| `markdown.md` | the clipboard's rich-text half, or the Jina endpoint |
| `bible.md` | the biblegateway scraper, or the Russian text |
| `wallhaven.md` | wallpaper setting and backend detection |
| `dpaste.md` | the dpaste request, expiry or syntax list |
| `audio-control.md` | output groups, presets, the test sound or reconnect |

## Rules

1. **Understand before you edit.** Read the real `.d.ts` of every API you use,
   and grep this repo for an existing solution. State the plan, the files and the
   verification before changing anything. Several `@vicinae/api` signatures differ
   from Raycast in ways the compiler does not explain.
2. **Test first.** Anything with logic gets a failing check before its
   implementation, and a bug fix ships with a check that fails without it. A check
   that cannot fail is worse than none. Assert against an external authority
   (RFC vectors, the real tool's output), not against the code under test.
3. **Verify, then report exactly what was and was not verified.** Compiling is not
   running. Never report a check that was not run, never imply the UI was seen when
   it was not, and write down in the final report every command that could not be
   exercised and why.
4. **Fix causes, not symptoms.** Find every caller before changing a shared
   function. Do not mix a refactor with a behaviour change in one commit.
5. **Delete rather than abstract.** One implementation means no interface. No
   dead code, no commented-out code, no unused exports (`tsc` does not catch them:
   grep), no configuration that never varies, no dependency for something a few
   lines would do.
6. **Stay in scope.** Change what the task needs. Do not reformat, rename or
   "improve" neighbouring code, and do not add dependencies, files or documents
   the task did not call for. Something out of scope that looks wrong goes in the
   report, not in the diff.
7. **Do not guess facts.** Endpoints, flags, response shapes and API behaviour are
   measured or read from source, not recalled. When a measurement is impossible
   here, say so; do not write the guess into code or docs as fact.
8. **Documentation is part of the change.** A change that makes a README, a doc or
   a manifest description false fixes it in the same commit. A doc that restates
   what the code or `ls` already says does not belong in the repo.
9. **Secrets never leave the process environment.** Not in `argv`, logs, toasts,
   commits, docs or tests. A credential you were handed is used for the task it
   was handed for, is not written to disk, and is not echoed.
10. **Irreversible actions need the owner's word.** Force-pushes, deleting
    branches or published history, and anything that touches data outside this
    repository are not done on inference.

## Workflow

1. Plan (rule 1). If the request is ambiguous, pick the reasonable default, build
   it, and say which assumption you made.
2. Write the failing check (rule 2).
3. Implement the smallest change that passes it.
4. Run the full gate and report (rule 3):

```bash
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/<extension>/<command>'
```

Run these from inside the extension directory. `./scripts/test-all` at the
repository root runs `npm test` in every extension (`--install` runs `npm ci`
where `node_modules` is missing); CI runs the same script.

| Command | Does |
| ------- | ---- |
| `npm run dev` | Builds, installs, watches, streams `console` output |
| `npm run build` | Type-checks, bundles, installs. **This is the install**; Vicinae need not restart |
| `npm run lint` | Validates the manifest against Vicinae's schema |
| `npm run check` | `tsc --noEmit` with `noUnusedLocals` |
| `npm test` | The extension's self-check scripts |

To remove an extension: `rm -rf ~/.local/share/vicinae/extensions/<name>`.
Launch addresses use the manifest's `author`: `vicinae://launch/@<author>/<name>/<command>`;
without the `@<author>` prefix it does not resolve.

After a launch, look for `Loaded extension <name>:<command>` in `vicinae logs`,
with no error after it. The log replays history, so filter by time or an old crash
looks new. `docs/definition-of-done.md` explains which log lines mislead.

## New extension, or port

```bash
./scripts/new-extension my-extension "My Extension" "What it does, in a sentence."
```

**Check first whether the original runs as it stands.** Vicinae resolves
`@raycast/api` and `@raycast/utils` at runtime, so a Raycast extension's own source
may run unmodified with only its manifest rewritten (`platforms`, scripts,
author). Deploy it that way and patch only what is measurably broken. A 1400-line
port of `google-translate` never showed a translation, and eleven commits went into
not finding out why; upstream ran on the first try (`docs/audits/translate.md`).

When a port is genuinely needed, write the audit before the port: command,
dependency and generated-code counts against upstream, every cut with its reason,
every fix with its measurement. `docs/audits/github-raycast.md` is the model.

## Hard-won constraints

These cost real debugging time. They are fixed.

- **Never run `npm init` in an extension.** It rewrites `contributors` into an
  object and drops `title` from checkbox preferences. Edit `package.json` by hand.
- **Manifest rules** (`vici lint`): `license` is exactly `MIT`; `author` matches
  `^[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*$`; `name` is a slug of at least 3 characters;
  `description` is at least 16 characters; every preference has `name`, `title`,
  `description` and `required`; a checkbox needs both `label` and `title`.
- **Every manifest command needs an entrypoint** `src/<command-name>.tsx`
  (or `.ts`/`.js`/`.jsx`). Without it the command is silently absent.
- **`tsconfig.json` must include `vicinae-env.d.ts`**, which `vici build`
  generates (git-ignored). It is the source of the global `Preferences` and
  `Arguments` types, and `npm run check` fails before the first build.
- **The injected `@raycast/api` is not the published one.** An absent
  `LocalStorage` key is `null`, not `undefined`, so a destructuring default does
  not apply: write `value ?? []`, never `= []`.
- **A `no-view` command gets no clipboard**: `Clipboard.readText()` returns `""`.
  Commands that read the clipboard are `view` commands that prefill a field.
- **Do not reimplement `@vicinae/api`**: `Clipboard.paste`, not `wtype`/`xdotool`;
  `getFrontmostApplication`, not a compositor query; `Cache`, not a hand-rolled
  LRU; the builtin `List` filter (driven through `keywords`), not `fast-fuzzy`.
- **`trash()` is `rm -r`.** Use `gio trash`.
- **Driving another app by keystrokes is not portable**: nothing can check the
  focus, so a miss types text into the wrong window and reports nothing
  (`docs/audits/tradingview-controls.md`).
- **User-facing strings are English**: titles, placeholders, actions, toasts,
  errors. Imported data, identifiers, paths and URLs are exempt.
- **The manifest `title` is repeated on every command row.** Keep it plain
  (`GitHub`); attribution goes in the README and `contributors`.
- **Replace the template's placeholder icon** before building a new extension
  (512×512; `file assets/extension_icon.png` confirms it). It is deliberately not
  any product's logo.

## Conventions

- TypeScript with `strict` and `noUncheckedIndexedAccess`.
- Imports across modules use the `~/` alias for `src/`.
- Dependencies point one way: `utils/` and `api/` never import `components/`.
  `utils/` is pure: no React, and no I/O unless I/O is the module's whole job.
- A module that imports `@vicinae/api` cannot be loaded by a headless test, so
  keep the logic you want to test out of it.
- Standard library first, then the platform, then an existing dependency, and only
  then new code. No shared runtime packages between extensions: duplication across
  independent packages is correct, hidden coupling is not.
- No formatter is enforced and none is to be added. Match the surrounding style.
