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

Available out of the box: `Action.CopyToClipboard` (with `concealed`),
`Action.Paste`, `Action.OpenInBrowser`, `Action.Open`, `Action.Push`,
`Action.SubmitForm`, `Action.Trash`, `Action.RunInTerminal`.

### Keybindings

Every action gets a `shortcut`. Without one it is reachable only by arrow-keying
to it, so a panel with a shortcutless action is unfinished.

Vicinae already has default keys for the generic verbs, and an extension must use
the *named* shortcut instead of a literal one:

```tsx
import { Action, Keyboard } from "@vicinae/api";

<Action title="Open" shortcut={Keyboard.Shortcut.Common.Open} onAction={open} />
```

A named shortcut resolves through the user's `keybinds` config, so a remap applies
everywhere. `shortcut={{ modifiers: ["ctrl"], key: "o" }}` looks identical today
and stays frozen when the user changes `action.open`.

The generic ids, with their defaults:

| `Keyboard.Shortcut.Common` | Default | For |
| --- | --- | --- |
| `Copy` | `ctrl+shift+c` | copy the selected item |
| `CopyName` | `ctrl+shift+.` | copy its name |
| `CopyPath` | `ctrl+shift+,` | copy its path |
| `Save` | `ctrl+s` | submit or persist an edit |
| `Duplicate` | `ctrl+d` | create a copy |
| `New` | `ctrl+n` | create something |
| `Open` | `ctrl+o` | open the selected item |
| `Edit` | `ctrl+e` | edit the selected item |
| `MoveUp` / `MoveDown` | `ctrl+shift+arrowUp/Down` | reorder the item itself |
| `Refresh` | `ctrl+r` | reread the data |
| `Pin` | `ctrl+shift+p` | pin the item |
| `Remove` | `ctrl+x` | a small, cheap removal |
| `OpenWith` | none | pick an application |

Two gaps worth knowing. `action.dangerous-remove` (`ctrl+shift+x`) has no constant
in `Keyboard.Shortcut.Common`, so an impactful removal hard-codes that pair. And
`Common.RemoveAll` exists in the TypeScript API while the server has no
`action.remove-all` default: it resolves to nothing, so a "remove all" action
needs its own literal key.

For a verb with no generic id — this extension's own domain — pick a literal
`ctrl+…` that is mnemonic and does not collide:

- `ctrl` for the row's primary action, `ctrl+shift` for its paired or impactful
  variant (`ctrl+s` start, `ctrl+shift+s` stop).
- Leave the launcher's own keys alone: `ctrl+b` toggles the action panel, `ctrl+p`
  opens the search filter, `ctrl+,` opens settings, `ctrl+shift+arrowUp/Down` is a
  generic "move" action. List navigation itself is the arrow keys.
- The same key on two different rows is fine; two actions in one panel is not.
- Put the resulting table in the extension's README, so the bindings are visible
  without opening the panel.

`cmd` also works and maps to Control on Linux, but write `ctrl`: nothing here runs
on macOS, and `cmd+…` reads like a Mac binding that the code does not honour.

Before inventing a key, read the live defaults:

```bash
vicinae config default | sed -n '/"keybinds"/,/^\t},/p'
```

The merged result of that and `~/.config/vicinae/settings.json` is what the
launcher actually binds; the source of truth for the defaults is `keybindInfos()`
in `src/server/src/internal/keyboard/keybind-manager.cpp` upstream.

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

Before calling a view finished, go through `docs/definition-of-done.md`.
