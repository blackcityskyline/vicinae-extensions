# Audit: Raycast GitHub → native Vicinae

Audit of [`raycast/extensions/extensions/github`](https://github.com/raycast/extensions/tree/main/extensions/github)
before porting, and what the port actually did about it. Every number below was
measured, not estimated.

## Scale

| | Upstream | Port |
| --- | --- | --- |
| Commands | 22 | 11 |
| Runtime dependencies | 8 | 2 |
| Lines of app code | ~9 500 | 2 758 |
| GraphQL schema + codegen output | 116 825 | 0 |
| Test checks | 3 | 39 |

## The search bug

The report was that repository search returns fewer results than the same search
on the GitHub website. Four separate causes, in order of severity.

### 1. A literal `null` token was sent to GitHub

`src/search-repositories.tsx:30` upstream:

```ts
`${searchFilter} ${searchText} ${sortQuery} fork:${preferences.includeForks} ...`
```

`searchFilter` is initialised to `null` and is only replaced once the filter
dropdown reports a change. A template literal stringifies `null` to the four
characters `"null"`, so the query becomes:

```
null vicinae sort: fork:true archived:false
```

GitHub ANDs free-text terms, so a repository now has to match `null` as well as
`vicinae`. Measured against the live API:

| Query | Results |
| --- | --- |
| `vicinae` | 261 |
| `null vicinae` | **0** |

Whether it fires depends on whether the dropdown fires `onChange` on mount, so
the failure looked intermittent rather than total — which matches a report of
"incomplete results" instead of "search is broken".

**Fixed** by `buildRepositoryQuery` in `src/api/search-query.ts`, which routes
every segment through a normaliser and drops empty ones, so a missing value can
never reach the query string. Locked down by four checks in
`test/search-query.test.ts`, one of which asserts the output contains neither
`null` nor `undefined`.

### 2. Archived repositories were hidden by default

`includeArchived` defaulted to `false`, which appended `archived:false` to every
query. The website shows archived repositories; the extension did not.

| Query | Results |
| --- | --- |
| `vicinae` | 261 |
| `vicinae archived:false` | 251 |

**Fixed** by defaulting `includeArchived` to `true` in the manifest. Archived
repositories are now badged in the row rather than hidden.

### 3. Page size was silently capped at 25

`getSearchPageSize()` was `Math.min(numberOfResults, 25)`, so the preference
default of 50 was unreachable and raising it above 25 did nothing.

**Fixed** by `parseResultCount`, which honours the preference and clamps to the
1–100 range GitHub actually accepts. Its test caught a real bug on the way:
`Number("")` is `0`, not `NaN`, so an empty preference clamped to the floor
instead of falling back to the default.

### 4. Results the server returned could not be matched locally

Passing `onSearchTextChange` to `List` turns Vicinae's builtin fuzzy filter
**off** — that is documented behaviour, and it is what upstream relied on. With
it off, the only ranking is GitHub's, and a query the server partially matched
had no second chance.

Upstream also never put the description, language or topics into `keywords`, so
even with filtering on, those fields would have been unmatchable: they are not in
the row title or subtitle.

**Fixed** by setting `filtering` explicitly on the list, so the server narrows
the candidate set and the C++ fuzzy filter narrows and re-ranks what came back.
`repositoryKeywords` feeds it `owner/name`, both halves separately, the
description, the language and the topics.

### Remaining ceiling, stated honestly

GitHub's own search caps at 1000 results per query, and `total_count` cannot be
surfaced in the list subtitle because `useCachedPromise` requires a paginated
function to resolve to an array. The README documents `in:readme` because the
index breadth differs sharply:

| Query | Results |
| --- | --- |
| `kubernetes in:name,description` | 248 589 |
| `kubernetes in:readme` | 1 162 546 |

The README index is 4.7× wider, and qualifiers are passed through untouched, so
the reach matches the website as long as the user knows the qualifier exists.

## Cut entirely

| Cut | Reason |
| --- | --- |
| `unread-notifications` (menu-bar) | `menu-bar` mode is macOS-only. |
| `my-issues-menu`, `my-stats-menu`, `my-pull-requests-menu`, `my-packages-menu` | Same — four more menu-bar commands. |
| `my-issues`, `my-pull-requests` | Each was a fixed filter over search results (`author:@me`). They are dropdown entries now, so two commands became six menu items. |
| `my-projects` | Projects v2 is a large API surface for little daily value. |
| `my-discussions`, `search-discussions` | Discussions search is preview-gated on the API. |
| `my-packages` | npm registry releases, unrelated to working in a repository. |
| `download-repository` | Needed `yauzl` for ZIP extraction to save one file the clone action already produces. |
| `src/tools/` (16 files) | Agent tool definitions for Raycast's AI. No equivalent surface in Vicinae. |
| `skills/github-pull-request-review/` | Raycast AI skill definitions. |
| `codegen.ts`, `schema/`, `src/generated/`, `.graphqlrc.ts` | 116 825 lines feeding a GraphQL layer that was replaced wholesale. |
| `helpers/package*.ts`, `useStarsTracker`, `useViewerStats`, `usePackageDownloadCount` | Belonged to the cut commands. |

## Dependencies

| Upstream | Disposition |
| --- | --- |
| `@octokit/rest` | Dropped. Replaced by `fetch` in `src/api/client.ts`. |
| `graphql-request` | Dropped with the GraphQL layer. |
| `node-fetch` | Dropped; the runtime is Node, which has global `fetch`. |
| `lodash` | Dropped; nothing needed it. |
| `date-fns` | Dropped; `Intl.RelativeTimeFormat` and `toLocaleDateString` cover it. |
| `yauzl` | Dropped with `download-repository`. |
| `@raycast/api` | Runtime-provided, as in every Vicinae extension. |
| `@raycast/utils` | Kept: `useCachedPromise` and `usePromise` are worth more than reimplementing. |

Two dependencies remain, down from eight. Store rule API-001 is the reason
`Clipboard.paste` was not needed and no fuzzy library was added.

## Linux-specific changes

**Editor launching.** Upstream hardcoded `/Applications/Visual Studio Code.app`
as an `appPicker` preference and opened repositories with `open -a`. Neither
exists on Linux. Replaced with a dropdown of editor binaries plus a clone
directory; the action clones if the checkout is missing, then spawns the editor
detached. `spawn` rather than `execFile`, because only `spawn` accepts
`detached` — `ExecFileOptions` has no such field in the Node typings.

**Terminal editors** are not in the dropdown, since they need a TTY. The
Run In Terminal action opens a shell at the checkout path instead, using
`options.workingDirectory` rather than a `cd` prefix.

**Repository dropdowns** come from `listViewerRepositories("collaborator", …)`,
matching the native `github` extension. Copying upstream's viewer-plus-organizations
dropdown would have needed a GraphQL round trip for the org list, and the
qualifiers are typeable anyway.

**Forms are controlled**, not `useForm`, following the native extension. That
removes the `Form.Values` type bridge between `@raycast/utils` and
`@vicinae/api` entirely, and `src/utils/form.ts` was deleted rather than kept
for a single caller.

**`Filter` prop.** The native extension hardcodes `sort: "updated"`, so its
results are never in relevance order. The port makes sort a dropdown and
excludes `sort:name`, which the repository search API rejects.

## Icons

Eight Raycast names have no Vicinae equivalent and are mapped in
`src/utils/icons.ts`: `Bubble`, `Document`, `Gear`, `Globe`, `Info`, `List`,
`Message`, `QuestionMark`, `Sidebar`. `Application`, `Repo`, `Branch`,
`PullRequest`, `Issue`, `StarFilled` and `Sync` do not exist under those names
either and are not used; `Git`, `Github`, `Box`, `Code`, `Cog` and
`StarCircle` cover the cases.

## Token kinds, measured

Both token kinds were driven against every endpoint on a real account.

| | fine-grained | classic (`repo`, `notifications`) |
| --- | --- | --- |
| Search, repositories, issues, PRs | 200 | 200 |
| README, branches, labels, assignees | 200 | 200 |
| Workflow runs (list) | 200 | 200 |
| `GET /notifications` | **403** | 200 |
| `GET /user/starred/{owner}/{repo}` | **403** | 204 |
| `PUT` / `DELETE /user/starred/{owner}/{repo}` | **403** | 204 / 204 |
| Rate limit | per token | 5000/hour |

A fine-grained token **cannot** read notifications. GitHub's permissions
reference lists 13 user-level permissions and Notifications is not one of them;
the word does not appear in the document. There is no checkbox to find, which is
the usual reason people conclude the UI is broken.

Classic tokens have **no separate starring scope** — `repo` covers it, which is
why the token settings page shows nothing about stars. A star/unstar round trip
left the account's star count unchanged at 100.

## Not verified

Everything below was found by driving the endpoints with a real token after the
first port landed, and is recorded here because none of it was visible to the
compiler or the test suite.

**Search itself is now verified against the live API.** The port's
`buildRepositoryQuery` output for `vicinae` returns 799 repositories where the
upstream query returns 0, and the empty-input guard suppresses the request
instead of asking for every repository on GitHub. `branches`, `labels`,
`assignees`, workflow runs, issue search and pull request search all answer 200.

**Two defects the static checks could not see, both fixed:**

- `listViewerRepositories` sent `affiliation=collaborator`, which GitHub answers
  with repositories you were added to *without* the ones you own. Measured:
  `collaborator` gave 0, `owner` gave 5, no parameter gave 14. All four views
  with a repository picker would have shown an empty list. Now sends no
  affiliation.
- Star state was read per row from `GET /user/starred/{owner}/{repo}`, which a
  read-only token cannot reach. It answered 403, and since `usePromise` turns a
  rejection into a failure toast, arrowing down a 50-row list would have produced
  50 error popups. State is now local and only written on an actual toggle.

**Still unverified:**

- **No command has been driven through the UI.** The agent cannot see the GUI.
  The commands load and start, and the query builder, list parsing and README
  decoding are covered by 59 headless checks, but nobody has pressed a button.
- **Nothing was written to the account.** The only write attempted was a star
  round trip on one of the user's own repositories, immediately undone and
  verified to leave the star count unchanged. Creating issues, pull requests and
  branches, cancelling and rerunning workflows, and marking notification threads
  read have all been left untried on purpose.
- **The `bitwarden` UI was never rendered** by the agent, though the user has
  since confirmed it works with their credentials.
