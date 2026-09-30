# Definition of done

Checklist before an extension is considered finished.

The rule IDs refer to `rules.json` in
`vicinae/extensions/skills/extension-reviewer/`. Nothing here is published to the
store — these are the maintainers' review rules, adopted as a quality bar
because they are the only written standard for this ecosystem. `blocking` marks
the ones that represent genuine defects.

## Automated

These must all pass. Do not report an extension as done without running them.

```bash
npm run lint     # manifest validates against Vicinae's schema
npm run check    # tsc, strict, noUnusedLocals
npm test         # self-checks
npm run build    # type-checks, bundles, installs
```

`npm run build` is the install. Confirm the command list in the build output
matches the manifest — a command listed in `commands` with no entrypoint is
silently missing at runtime.

## Runtime

Compiling is not running. Launch it:

```bash
npm run dev                                                   # in one terminal
vicinae 'vicinae://launch/@black/<extension>/<command>'      # in another
```

Check `vicinae.log` for `Loaded extension <name>:<command>` and no error, and
confirm the UI actually renders. If the command needs credentials, a logged-in
tool or a GUI to interact with, say plainly that the UI was not verified rather
than implying it was.

### Reading a command that failed

Two things in the log mislead, both of which cost time to rule out:

- **`Worker <name>:<command> exited with code 1` is not necessarily a failure.**
  The manager terminates a `no-view` worker once the command returns, and a
  terminated worker exits non-zero. It logs that line unconditionally, and for a
  `view` command too, on the five-second teardown timer. A real crash is logged
  as `Extension exited prematurely with exit code …`, which does not appear when
  the teardown was orderly. Confirm a `no-view` command worked by observing its
  effect, not by reading this line.
- **The worker's own stderr is not in the log.** It goes to
  `~/.local/share/vicinae/support/<extension>/.vicinae/stderr.txt`, truncated on
  every launch. `npm run dev` only builds `view` commands, so it never shows a
  `no-view` failure either.

`@vicinae/api` *is* resolvable inside both worker kinds: the manager patches
`Module.prototype.require` to map it, and maps `@raycast/api` onto a proxy over
it. A hand-rolled `node` harness that skips that patch fails at `require` with a
misleading `Cannot find module '@vicinae/api'`.

## Manifest — MANIFEST-001

- [ ] `description` says what the extension actually does. If it needs a CLI, an
      API key or a specific tool, that is stated.
- [ ] Every command's `description` matches what running it does.
- [ ] `license` is `MIT`.
- [ ] `platforms` lists only platforms actually supported.
- [ ] Extension and command icons are referenced, exist in `assets/`, and are
      512x512.

## Dependencies — DEPENDENCY-001

- [ ] Every dependency is imported somewhere. No leftovers from a stripped-down
      port.
- [ ] Nothing reimplements the standard library or `@vicinae/api`.
- [ ] `package-lock.json` is committed.
- [ ] No new dependency was added for something a few lines of TypeScript or an
      existing built-in would do.

## API usage — API-001 (blocking)

- [ ] No shelling out where `@vicinae/api` has an API: `Clipboard.paste` not
      `wtype`/`xdotool`, `getFrontmostApplication` not a compositor query,
      `Cache` not a hand-rolled LRU, builtin fuzzy `List` filtering not
      `fast-fuzzy`.
- [ ] The builtin filter is driven through `keywords`, not by passing
      `onSearchTextChange` (which disables it).
- [ ] Icons come from `Icon`, with a shim for the ten Raycast names Vicinae
      lacks.

## Language — UX-003 (blocking)

- [ ] Every user-facing string is English: titles, placeholders, action labels,
      toasts, error messages, empty-view text.
- [ ] Content that is inherently non-English (a dictionary, a translation tool)
      is fine; interface chrome is not.

## Correctness — CORRECTNESS-001

- [ ] Non-trivial logic has a self-check under `test/`.
- [ ] Crypto is verified against published vectors, not against itself. See
      `bitwarden/test/totp.test.ts` for the RFC 6238 pattern.
- [ ] Unchecked `await`, and promises that can reject unhandled.
- [ ] Secrets are passed through the environment, never `argv`.
- [ ] Errors surfaced to the user are actionable — what failed and what to do.

## User experience — UX-001, UX-002

- [ ] Every command that can fail shows a failure state or toast. No silent
      catch.
- [ ] Loading states exist for anything asynchronous.
- [ ] Empty states explain the next action, not just "nothing here".
- [ ] Missing prerequisites (a CLI, a config file) produce a message that says
      how to install or configure them.

## Code quality — QUALITY-001

- [ ] No dead code: unused exports, imports kept alive artificially,
      commented-out blocks, or generated files in `src/`.
- [ ] `grep` for exported symbols and confirm each has a caller. `tsc
      --noUnusedLocals` does not catch unused exports.
- [ ] Comments explain why, not what. Nothing narrates the obvious.
- [ ] No `platform === "macos"` branches in a Linux-only extension.

## Security — SECURITY-001, SECURITY-002, SECURITY-003 (all blocking)

- [ ] No binary is downloaded and executed. Asking the user to install a tool
      themselves is the correct pattern; a bundled ~100 MB download is not.
- [ ] Process arguments are passed as an array, never built into a shell string.
      Dynamic values in a parameterised `execFile` call are fine; `sh -c` with
      interpolation is not.
- [ ] No `eval`, `new Function`, or decoded executable strings.
- [ ] Values that came from the network or from command output are not
      interpolated into anything executable.
- [ ] Persistent sensitive data uses `LocalStorage` from `@vicinae/api`, not
      ad-hoc files or `Cache`. `Cache` is for non-sensitive data only.
- [ ] Credentials are neither logged nor sent anywhere unrelated.
- [ ] Secrets are not handed to spawned commands that do not need them.

## Processes — PROCESS-001

- [ ] Every spawned program is documented and obviously related to the
      extension's stated purpose.
- [ ] No child process can outlive Vicinae; long-running helpers are killed on
      teardown.
- [ ] A documented system tool that the extension legitimately depends on is
      acceptable and does not need justifying further.

## Network — NETWORK-001

- [ ] Every endpoint contacted plausibly serves the extension's stated purpose.
- [ ] No analytics, no tracking, no telemetry that the README does not mention.
- [ ] No vault contents, credentials or personal data leave the machine for a
      reason the user would not expect.

## Honesty — DECEPTION-001

- [ ] Names, descriptions and README claims match what the code does.
- [ ] No hidden behaviour: nothing executes that the manifest does not imply.
- [ ] Any data transmission is disclosed.

## Assets — ASSET-001

- [ ] No unused files in `assets/`. Ported extensions accumulate icons for
      removed features.
- [ ] No macOS-only artwork such as `sf_symbols_*.svg`.
- [ ] No bundled executables. On Linux the tool is a distro package; resolve it
      from `PATH` or a preference instead.

## Not a duplicate — FUNCTIONALITY-001 (blocking)

- [ ] The extension is not a replica of something Vicinae already ships
      (calculator, emoji picker, clipboard history). An integration with an
      external tool is fine.
- [ ] Check `vicinae/extensions/extensions/` for an existing extension covering
      the same ground. Note in the README how this one differs if one exists.

## Verify behaviour against the real API, not only the compiler

A clean type-check says nothing about whether a request is well formed. Drive
each endpoint once with a real credential before calling anything finished.

- [ ] Every endpoint an extension wraps has been called at least once.
- [ ] Filter and qualifier parameters were compared against the documented
      semantics, not assumed. `affiliation=collaborator` excludes repositories
      you own; that emptied four repository pickers in the GitHub port and no
      compiler noticed.
- [ ] Failures a limited token produces are graceful. A 403 on a per-row read
      becomes one error toast per row, because `usePromise` reports rejections.
- [ ] The UI has been exercised by a human, or the report says plainly that it
      has not. Compiling, bundling and loading are not the same as working.

## Attribution, when the code came from elsewhere

- [ ] A port credits the original author in the README and in the manifest's
      `contributors`.
- [ ] The README states the prerequisites and what the port changed.
- [ ] Upstream behaviour that was deliberately dropped is listed, so the next
      reader does not assume it is an oversight.
