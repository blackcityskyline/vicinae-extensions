# Authoring a Vicinae extension

For building an extension from scratch. If you are porting a Raycast extension,
read `docs/api-porting.md` as well.

## The model

An extension is a single npm package. `vici build` type-checks it, bundles each
command into one JavaScript file, and copies the result into
`~/.local/share/vicinae/extensions/<name>/`.

There is no browser, no DOM and no HTML. React components describe a UI tree that
Vicinae's C++ core renders natively. `console.log` goes to the terminal running
`vici develop`, not to a devtools console.

The runtime is Node, so `fs`, `path`, `child_process` and `crypto` are all
available.

## Two kinds of command

`mode` in the manifest decides what a command file exports.

**`view`** exports a React component. It renders a view and can push more views
onto the navigation stack.

```tsx
export default function SearchCommand() {
  return <List searchBarPlaceholder="Search" />;
}
```

**`no-view`** exports a plain async function. Use it for anything that just
performs an action — lock a vault, copy a value, toggle a setting. No UI is
pushed, so it is the right shape for keyboard-bound actions.

```ts
export default async function LockCommand() {
  await doTheThing();
}
```

**`menu-bar`** adds an item to the macOS menu bar. Linux-only extensions should
not use it.

## Views

| Component | Use for |
| --------- | ------- |
| `List` | Searchable collection. The default choice. |
| `Grid` | Image-led collection. |
| `Detail` | A single scrollable document, rendered from Markdown. |
| `Form` | Input. |
| `ActionPanel` | The actions available for the current selection. |

`List` and `Grid` fuzzy-filter their items in C++ by default. This is disabled
the moment you pass `onSearchTextChange`, so if you want the builtin behaviour,
do not pass it — feed extra search terms through each item's `keywords` prop
instead, which rank below the title.

```tsx
<List.Item title={item.name} subtitle={item.username} keywords={item.uris} />
```

A `List` should always handle three states: loading, empty, and populated. An
empty view that says only "no results" is a UX-001 failure; say what to do next.

## Actions

`ActionPanel` holds `Action` components. `ActionPanel.Section` groups them under
a heading, and the first action is the one `Enter` triggers.

`ActionPanel.Submenu` keeps a long list navigable instead of dumping twenty
entries into the panel.

Give actions explicit `shortcut` props. `cmd` maps to Control on Linux; `alt` is
the usual secondary modifier. Without a shortcut an action is reachable only by
arrow-keying to it.

Available out of the box: `Action.CopyToClipboard` (with `concealed`),
`Action.Paste`, `Action.OpenInBrowser`, `Action.Open`, `Action.Push`,
`Action.SubmitForm`, `Action.Trash`, `Action.RunInTerminal`.

## Preferences

Declare them in the manifest and read them with `getPreferenceValues`. The
generated `vicinae-env.d.ts` types them per command.

```tsx
const { primaryAction } = getPreferenceValues<Preferences.Search>();
```

Prefer a dropdown over a checkbox when the user is choosing between named
options, and check `environment.commandName` when one command needs different
defaults from another.

Read preferences once at module or component scope — they do not change while a
command is running.

## Talking to the outside world

Wrap every external dependency in a small module under `src/api/` and return
results rather than throwing, so callers branch on a failure instead of wrapping
each call.

```ts
type MaybeError<T> = { result: T; error?: undefined } | { result?: undefined; error: Error };
```

Give every external call a timeout, and distinguish "the tool is not installed"
from "the tool failed" — the first needs an installation hint, the second needs
the error text.

Classify failures from the other program's own output, since that is where the
meaning is. Pattern-match once, at the boundary, and translate into your own
error types. Do not let vendor error strings leak into the UI.

## State and persistence

| Need | Use |
| ---- | --- |
| UI state | `useState` |
| State shared by a subtree | one React context per concern |
| Non-sensitive data across runs | `Cache` |
| Sensitive data across runs | `LocalStorage` |
| Preferences set by the user | `getPreferenceValues` |

`Cache` is plain text on disk and is never encrypted. Never put vault contents,
tokens or passwords in it.

## Checklist for a new view

- [ ] Handles loading, empty and populated states
- [ ] Actions have titles, icons and shortcuts
- [ ] Long action lists are grouped or in a submenu
- [ ] Failures produce a message that says what to do
- [ ] No secret reaches a log, a toast or the clipboard history
- [ ] User-facing strings are English

`docs/definition-of-done.md` is the full version.
