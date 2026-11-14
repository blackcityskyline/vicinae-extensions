# GitHub

Native Vicinae GitHub extension for Linux, ported from the Raycast one. It
replaces the store's `github` under the same name; rename the manifest `name` and
its deeplinks to keep both.

## Setup

Create a **classic** personal access token at
[github.com/settings/tokens/new](https://github.com/settings/tokens/new) with the
`repo` and `notifications` scopes and put it in the preferences. A fine-grained
token cannot read notifications at all: that permission does not exist for them.

| Scope | Grants |
| --- | --- |
| `repo` | read and write repositories, and starring |
| `notifications` | read notifications, mark threads read |

## Commands

| Command | What it does |
| --- | --- |
| Search Repositories | Search every repository the token can see. |
| My Repositories | Browse what you own or starred, filtered locally. |
| Search Issues | Search issues with preset and state filters. |
| Search Pull Requests | Search pull requests with preset and state filters. |
| Create Issue | File an issue, with labels and an assignee. |
| Create Pull Request | Open a pull request between two branches. |
| Create Branch | Branch off an existing branch. |
| Workflow Runs | Inspect runs, cancel, rerun, rerun failed jobs. |
| Notifications | The inbox, with an unread/all switch. |
| Cancel Workflow Run | `no-view`, takes `owner`, `repository`, `runId`. |
| Rerun Workflow Run | `no-view`, adds optional `failedJobsOnly`. |

## Search

Typing queries GitHub directly, qualifiers included: `stars:>1000`,
`language:rust`, `user:defunkt`, `in:readme`, `fork:only`. The query is built by
`buildRepositoryQuery`, which drops empty segments instead of sending the literal
`null` the Raycast original did. Vicinae's filter narrows and re-ranks the answer,
with description, language and topics in `keywords`. My Repositories loads a page
and filters locally, so typing cannot hit a rate limit.

## Repository rows

| Action | Shortcut | Needs |
| --- | --- | --- |
| Open in *editor* | enter | an editor configured |
| Clone | ctrl+shift+c | nothing |
| View README | ctrl+r | read access |
| View Images | from the README view | read access |
| Star / Unstar | ctrl+s | `repo` |
| Add to / Remove from My List | ctrl+shift+l | nothing |
| Copy Clone URL (SSH / HTTPS) | ctrl+c / ctrl+shift+u | — |

Clone lays a repository out as `<Clone Directory>/<owner>/<repo>`, reuses an
existing checkout and returns nothing on failure, so an editor is never started
on a directory that does not exist. GUI editors (`code`, `cursor`, `codium`,
`windsurf`, `zed`, `idea`) are spawned detached; terminal ones (`emacs`, `nvim`,
`vim`, `helix`) open in a terminal window, since spawning them without a TTY
fails. Both pass argv, so paths with spaces stay one argument.

View README renders up to 120 000 characters (the renderer is minimal, and some
READMEs are megabytes); the truncation is stated. View Images lifts `![alt](url)`,
`<img src>` and reference images into a `Grid`, resolves relative paths against
the default branch and separates badges from real images.

My List is kept in `LocalStorage` under `custom-repositories`: no network request
to open it, but star counts go stale until a repository is re-added from search.

## Preferences

| Preference | Default | Notes |
| --- | --- | --- |
| GitHub Token | — | Required. |
| Results per page | 50 | Clamped to 10–100. |
| Default Repository Scope | My Repositories | Which scope My Repositories opens on. |
| Include forks | on | Appends `fork:true`. |
| Include archived | on | Appends `archived:false` when off. |
| Open Repositories In | None | Editor binary, or None to hide Open in Editor. |
| Clone Directory | `~/Code` | `<dir>/<owner>/<repo>`; a leading `~` expands. |

## Limits

- A failed permission check is a toast naming the failure, never a silent no-op.
- Star and list membership are local, not read back from GitHub.
- README images are only in their own Grid: `Detail` does not reliably draw them.
- Port of the [Raycast GitHub extension](https://github.com/raycast/extensions/tree/main/extensions/github),
  with the GraphQL layer, the codegen and half the commands removed.
