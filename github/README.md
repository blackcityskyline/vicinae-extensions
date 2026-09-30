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

1. Create a **classic** personal access token at
   [github.com/settings/tokens/new](https://github.com/settings/tokens/new) with
   the `repo` and `notifications` scopes. A fine-grained token cannot read
   notifications at all — see [Token permissions](#token-permissions).
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
| Notifications | The inbox, with an unread/all switch. Mark threads read without leaving the keyboard. |
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

## Repository rows

Every repository row carries the actions worth having. The first is contextual:
with an editor configured in preferences it clones the repository if needed and
opens it, otherwise it opens the browser.

| Action | Shortcut | Needs |
| --- | --- | --- |
| Open in *editor* | `enter` | an editor configured |
| **Clone** | `cmd+shift+c` | **nothing** |
| View README | `cmd+r` | read access |
| View Images | from the README view | read access |
| Star / Unstar | `cmd+s` | `repo` |
| Add to / Remove from My List | `cmd+shift+l` | nothing |
| Open in Browser | — | — |
| Copy Clone URL (SSH) | `cmd+c` | — |
| Copy Clone URL (HTTPS) | `cmd+shift+u` | — |
| Copy Repository URL | — | — |

The **Local** section — Show in File Browser, Open Terminal Here — is always
present, since the clone directory exists whether or not an editor is set.

### Cloning

**Clone** clones into the directory set by the `Clone Directory` preference,
laying it out as `<cloneDirectory>/<owner>/<repo>`, and does nothing else. It
needs no editor configured, which is the point: cloning used to be a side effect
of *Open in Editor*, so the feature did not exist until a preference was set.

An existing checkout is reused, never re-cloned. A failed clone — missing `git`,
a non-empty target, a repository that does not exist — returns nothing rather
than a path, so an editor is never launched on a directory that is not there.

Verified with the real code against live repositories: the first call cloned and
returned the expected path, the second returned the same path without cloning
again, and a non-existent repository returned null.

### Editors

`code`, `cursor`, `codium`, `windsurf`, `zed`, `idea`, `emacs`, `nvim`, `vim`,
`helix`.

GUI editors and terminal editors are launched differently, and this matters:

| Kind | Editors | How |
| --- | --- | --- |
| GUI | code, cursor, codium, windsurf, zed, idea | spawned detached, so they outlive the launcher |
| Terminal | emacs, nvim, vim, helix | opened **in a terminal window** with the repository as the working directory |

`nvim /path` spawned without a TTY prints `Output is not to a terminal` and
behaves badly, so terminal editors are never spawned bare. Both forms pass argv
rather than a shell string, so a clone path containing spaces stays one
argument.

### View README

Pushes the repository's README into the launcher as rendered Markdown, with a
metadata panel (description, stars, language, last push) and the usual actions.
`esc` returns to the list you came from.

READMEs are truncated at 120 000 characters, because `Detail`'s Markdown
renderer is documented as minimal and a few repositories have multi-megabyte
READMEs. The truncation is stated in the document and in the metadata panel
rather than cutting the text silently. A repository with no README says so
instead of showing an error.

### Images

`Detail` does not reliably draw inline images, so **View Images** lifts them out
of the document into a `Grid`, which does render remote images. Arrow through
them, and the actions open the image, copy its URL, or copy the file name.

Three syntaxes are recognised, because READMEs are not consistent:

| Syntax | Notes |
| --- | --- |
| `![alt](url)` | with an optional `"title"`, which is not treated as part of the URL |
| `<img src="url" alt="...">` | **the common case** — `vicinaehq/vicinae` has seven images and every one is HTML, with none in Markdown |
| `![alt][ref]` | resolved through the `[ref]: url` definition; skipped when undefined |

Relative paths (`extra/screenshot.png`) are resolved against the repository's
default branch rather than `HEAD`, so the URL keeps pointing at the branch the
README was read from. `..` can pop path segments but never escapes the branch,
because a URL that escapes it would simply 404. `data:` URIs are skipped, as
they are not fetchable.

**Badges are filtered into their own section.** A README's images are mostly
status badges — 3 of the 4 in `BurntSushi/ripgrep` — and a grid of shields is
useless. Detection covers badge hosts (`shields.io`, `badge.fury.io`,
`codecov.io`, `repology.org`, and others) plus badge-shaped paths such as
`…/workflows/ci/badge.svg`, which is how a project serves its own badges. Real
images are kept in the first section, badges in the second.

Verified against five live READMEs: every extracted URL was fetched and returned
200.

### My List

A list of repositories you keep yourself, stored in `LocalStorage` under
`custom-repositories`. It is local on purpose: it is a launcher convenience, not
something to push to an account, and it needs no token permission, so it works
with a read-only token. Reach it from the scope dropdown in **My Repositories**.

The list stores the whole repository payload, so opening it makes no network
request at all. The cost is that a stored row's star count and "last push" go
stale; re-adding a repository from Search Repositories refreshes it.

## Token permissions

**Use a classic personal access token, not a fine-grained one.** Verified by
driving every endpoint with both kinds on a real account.

A fine-grained token **cannot call the notifications endpoints at all.** The
official permissions reference
([docs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens))
contains 13 user-level permissions and "Notifications" is not among them; the
word does not appear in the document. There is no checkbox to find.

A classic token needs two scopes, at
`https://github.com/settings/tokens/new`:

| Scope | Grants |
| --- | --- |
| `repo` | read and write repositories, and starring |
| `notifications` | read notifications, mark threads read |

There is **no separate "starring" scope** on a classic token, which is why the
settings page does not show one — `repo` covers it. Confirmed: `PUT
/user/starred/{owner}/{repo}` returns 204, `DELETE` returns 204, and a
star/unstar round trip left the account's star count unchanged at 100.

What each command needs:

| Command | Scope |
| --- | --- |
| Search Repositories, My Repositories, Search Issues/PRs | `repo` |
| View README, Create Branch, Workflow Runs (list) | `repo` |
| Create Issue, Create Pull Request | `repo` (write) |
| Cancel / Rerun Workflow Run | `repo` (write) |
| Star / Unstar | `repo` |
| Notifications | `notifications` |

A missing permission surfaces as a toast naming the failure, not as a silent
no-op. Star and list membership are tracked locally rather than read back from
GitHub, so a token that cannot star still gets working buttons that report the
failure when pressed.

## Preferences

| Preference | Default | Notes |
| --- | --- | --- |
| GitHub Token | — | Required. |
| Results per page | 50 | Clamped to 10–100, which is what the API accepts. |
| Default Repository Scope | My Repositories | Which scope My Repositories opens on. |
| Include forks | on | Appends `fork:true`. |
| Include archived | on | Appends `archived:false` when off. |
| Open Repositories In | None | Editor binary, or None to hide *Open in Editor*. Clone still works. |
| Clone Directory | `~/Code` | Where Clone puts a repository, as `<dir>/<owner>/<repo>`. A leading `~` expands. |

## Linux notes

- `Clone` works with no editor configured. It clones into `Clone Directory` as
  `<dir>/<owner>/<repo>` and reuses an existing checkout.
- GUI editors (`code`, `cursor`, `codium`, `windsurf`, `zed`, `idea`) are spawned
  detached. Terminal editors (`emacs`, `nvim`, `vim`, `helix`) are opened in a
  terminal window instead, because spawning them without a TTY does not work.
  Both pass argv, so paths with spaces are safe.
- The preferences upstream ships are macOS-only (`/Applications/…` app paths, a
  `/bin/sh` clone command, four `menu-bar` commands) and are not carried over.

## Tests

```bash
npm test
```

83 headless checks over the pure modules: the query builder (including the
`null` regression), the display, path and editor-mapping helpers, and the three
parsers of data the extension did not produce — the `LocalStorage` custom list,
the base64 README payload, and README image references. Vicinae has no test
runner, so these are plain scripts run with `tsx`.

`npm test` only works because everything under `src/utils/` is free of
`@vicinae/api`. Importing the API outside Vicinae throws, since `getGlobal()`
returns undefined, so the impure halves live in `src/api/`.

## Credits

Port of the [Raycast GitHub extension](https://github.com/raycast/extensions/tree/main/extensions/github),
with the GraphQL layer, the codegen and roughly half the commands removed.
