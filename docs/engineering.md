# Engineering discipline

How work is done in this repository. These are process rules, not API facts —
the API facts live in `docs/api-porting.md`.

## 1. Plan and analyse before writing code

Do not open an editor first. Before implementing anything:

1. **Read the actual API.** Open the `.d.ts` in
   `node_modules/@vicinae/api/dist/` or the type declarations of a dependency
   and confirm the signature. Do not work from memory of Raycast's API, from the
   extension's own usage, or from a search result. Several APIs here differ in
   ways that are invisible until the compiler or the runtime disagrees.
2. **Find out what already exists.** `grep` the repo before writing a helper.
   `bitwarden/` already contains a CLI wrapper, an icon shim, a form bridge and
   a test harness. Check `vicinae/extensions/extensions/` before building
   something a shipped extension may already do.
3. **State the plan in the response** — what will change, which files, and how
   it will be verified. If the request is ambiguous, pick the reasonable
   default, build it, and say which assumption was made. Do not stall waiting
   for a confirmation that is not required to make progress.
4. **Split large work into verifiable steps** that each leave the repo building.

Knowing the change is the hard part. Laziness that skips comprehension ships a
confident wrong answer.

## 2. Test first

Write the failing check before the implementation, for anything with logic.

Vicinae has no test runner and no DOM, so "test" means a plain script under
`test/` that exits non-zero on failure. See
`templates/extension/test/example.test.ts`.

The loop is: write the check, watch it fail, implement, watch it pass. Skipping
straight to the implementation and adding a check afterwards produces checks
that assert whatever the code happens to do.

What deserves a check:

- Parsing, especially of input from another program
- Crypto, encoding, dates, number formatting
- Anything with a boundary condition or an off-by-one
- Error classification — which failure produces which message

What does not: React components that only arrange props, and one-line wrappers.

**Verify against an external authority, not against yourself.** For crypto use
the published test vectors — `bitwarden/test/totp.test.ts` checks TOTP against
RFC 6238, and doing so caught three real bugs in that implementation: a base32
secret decoded as base64, Steam Guard derived from the decimal output instead of
the 31-bit truncated value, and a test comparing against the wrong counter.

A check that cannot fail is worse than no check. Assert specific values, not
just that something is truthy.

## 3. Clean, readable code

**Names carry the meaning.** `readStdinBuffer`, not `doThing`. A comment is only
justified when the code cannot say it.

**Comments explain why, never what.** The following is noise and gets deleted:

```ts
// Loop over the items
for (const item of items) {
```

This earns its place:

```ts
// `URI.parse` validates HOTP parameters and would otherwise fail with a
// confusing "missing counter" message, so the type is checked up front.
if (/^otpauth:\/\/hotp/i.test(uri)) throw new InvalidAuthenticatorKeyError(...);
```

**Functions do one thing and say so in their name.** If a function needs a
sentence to explain, it is two functions.

**Delete rather than abstract.** One implementation means no interface. A
factory for a single product, a config value that never changes, a wrapper that
adds nothing — all of it is cost with no benefit. Prefer the standard library,
then the platform, then an existing dependency, and only then new code.

**Fail loudly and specifically.** An empty `catch {}` that swallows an error is
a bug that reports itself as "nothing happened". Every failure path either
recovers meaningfully or surfaces to the user with what failed and what to do.

**No commented-out code.** Git remembers it. No `TODO` without an issue
reference. No debug logging left behind.

## 4. Strict structure

Each extension is an independent npm package. Nothing is shared at runtime.

```
<extension>/
  package.json          manifest; hand-edited, never regenerated
  tsconfig.json         strict; must include vicinae-env.d.ts
  assets/               icons only; every file must be referenced
  src/
    <command>.tsx       one entrypoint per command in the manifest
    api/                I/O: CLI calls, HTTP, filesystem
    components/         presentational pieces
    context/            shared state, one provider per concern
    utils/              pure helpers, no React
    types/              type definitions
  test/                 self-check scripts
```

Rules that follow from this:

- **Dependency direction is one way.** `utils/` and `api/` never import from
  `components/`. Presentational code never talks to a CLI directly.
- **`utils/` is pure.** No React, no I/O unless the module's whole job is I/O.
  This is what makes it testable without a renderer.
- **One entrypoint file per command**, named exactly as the manifest's `name`.
  A command in the manifest with no file is silently absent at runtime.
- **A module owns one concern.** `src/utils/totp.ts` generates codes; it does
  not also fetch them or render them.
- **Cross-module imports use the `~/` alias**, never long relative chains.
- **No shared runtime packages between extensions.** If two extensions need the
  same helper, each gets its own copy. Duplication across independent packages is
  correct; a hidden coupling is not.

## 5. Verify before claiming done

**Compiling is not running.** A clean `tsc` and a successful bundle say nothing
about whether the command renders. After a change:

```bash
npm run lint && npm run check && npm test && npm run build
vicinae 'vicinae://launch/@black/<extension>/<command>'
```

Then confirm in `vicinae.log` that the extension loaded, and look at the actual
UI.

**Report honestly.** State exactly what was verified and what was not. "Builds
clean and the command loads" is a true and useful claim; implying the UI works
when it was never rendered is not. If a command needs credentials, a logged-in
tool or a GUI, say that it could not be exercised headlessly.

**Never fake verification.** Do not write a check that asserts nothing, do not
report a build that was not run, do not mark a step done because it looked
right.

## 6. Fix causes, not symptoms

Before editing, find every caller of what you are about to change. A guard
inside the shared function is a smaller and more correct diff than a guard in
each caller, and patching only the path that was reported leaves the siblings
still broken.

When a bug is found, the fix ships with a check that fails without it.

## 7. Small, honest commits

One logical change per commit. The message says what changed and, when it is not
obvious, why. Do not commit generated files (`vicinae-env.d.ts`, bundles,
`node_modules`) or unrelated reformatting.

Do not rewrite history that has been pushed, and do not mix a refactor with a
behaviour change.

## 8. Security is the default

- Secrets go through the environment, never `argv` — anything in `argv` is
  readable from `/proc` by other users.
- `Clipboard.copy(value, { concealed: true })` for anything sensitive, so it is
  not indexed in the clipboard history.
- Redact secrets from error text before it reaches a toast or a log, escaping
  regex metacharacters when you do.
- Persistent sensitive data goes in `LocalStorage`; `Cache` is for
  non-sensitive data only.
- Prefer a system keychain or Secret Service over a plaintext file when one is
  available and the use case needs it.
- Validate anything arriving from a network response or from another program's
  output before it reaches an executable context.
