# GitHub

A native Vicinae GitHub extension for Linux, ported from the Raycast one.

## Why this exists

The [GitHub extension in the store](https://github.com/vicinaehq/extensions/tree/main/extensions/github)
is a good first pass but thin in two places: it has no repository actions worth
the name (no editor launch, no clone, no star), and its search is a single
hardcoded `sort: "updated"` with no local ranking.

This fixes search, and adds the repository actions the Raycast version had. See
[`docs/audits/github-raycast.md`](../docs/audits/github-raycast.md) for the full
audit, including the root cause of the search bug in the Raycast original.

It replaces the store's `github` under the same name. If you want both, rename
this one — the manifest `name` and the deeplinks change with it.

## Setup

1. Create a personal access token on GitHub. A fine-grained token needs:
   - **Repository access**: read for search and browsing, plus write for
     creating issues, pull requests and branches
   - **Actions**: read and write, to cancel and rerun workflow runs
   - **Notifications**: read, and write to mark threads read
2. Put it in the extension preferences.

## Commands

| Command | What it does |
| --- | --- |
| Search Repositories | Search every repository the token can see. |
| My Repositories | Browse what you own or starred, filtered locally and instantly. |
| Search Issues | Search issues with preset and state filters. |
| Search Pull Requests | Search pull requests with preset and state filters. |
| Create Issue | File an issue, with labels and an assignee. |
| Create Pull Request | Open a pull request between two branches. |
| Create Branch | Branch off an existing branch. |
| Workflow Runs | Inspect runs, cancel, rerun, rerun failed jobs. |
| Notifications | Work through the inbox and mark threads read. |
| Cancel Workflow Run | `no-view`, takes `owner`, `repository`, `runId`. |
| Rerun Workflow Run | `no-view`, adds optional `failedJobsOnly`. |

## Search

Search is the part worth explaining.

Typing queries GitHub directly. Qualifiers are passed through untouched, so
everything the website supports works here too:

```
stars:>1000          in:readme            user:defunkt
org:acme             topic:raycast         language:rust
pushed:>2026-01-01   fork:only             archived:true
```

Two things make it behave differently from a naive client:

**The query is built by a tested function.** `buildRepositoryQuery` normalises
every segment and drops empty ones. The Raycast original interpolated a `null`
into its query string, which sent the literal token `null` to GitHub and ANDed
it with the search text — `null vicinae` returns 0 results where `vicinae`
returns 261.

**Local filtering stays on.** `filtering` is set explicitly, so GitHub narrows
the candidate set and Vicinae's builtin fuzzy filter narrows and re-ranks what
came back. Each row carries the description, language and topics in `keywords`,
so those are searchable even though they are not in the title.

My Repositories does not query at all while you type. It loads a page and lets
the C++ filter do the work, so it is instant and cannot hit a rate limit.

## Preferences

| Preference | Default | Notes |
| --- | --- | --- |
| GitHub Token | — | Required. |
| Results per page | 50 | Clamped to 10–100, which is what the API accepts. |
| Default Repository Scope | My Repositories | Which scope My Repositories opens on. |
| Include forks | on | Appends `fork:true`. |
| Include archived | on | Appends `archived:false` when off. |
| Open Repositories In | None | Editor binary. Hides the editor action when None. |
| Clone Directory | `~/Code` | Where the editor action clones to. A leading `~` expands. |

## Linux notes

- The editor action clones to `Clone Directory` if the checkout is missing, then
  launches the editor detached. `code`, `cursor`, `codium`, `windsurf`, `zed`
  and `idea` are supported; the action is hidden when the preference is None.
- Terminal editors are deliberately absent from the dropdown, since they need a
  TTY. Use the Run In Terminal action, which opens a shell at the checkout.
- The preferences upstream ships are macOS-only (`/Applications/…` app paths, a
  `/bin/sh` clone command, four `menu-bar` commands) and are not carried over.

## Tests

```bash
npm test
```

39 headless checks over the two pure modules: the query builder (including the
`null` regression) and the display, path and editor-mapping helpers. Vicinae has
no test runner, so these are plain scripts run with `tsx`.

`npm test` only works because `src/utils/launch.ts` is free of `@vicinae/api`.
Importing the API outside Vicinae throws, since `getGlobal()` returns undefined.
The impure half lives in `src/api/open-repository.ts` for that reason.

## Credits

Port of the [Raycast GitHub extension](https://github.com/raycast/extensions/tree/main/extensions/github),
with the GraphQL layer, the codegen and roughly half the commands removed.
