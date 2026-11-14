# Raycast `todo-list` → dated files

Source: [`raycast/extensions/extensions/todo-list`](https://github.com/raycast/extensions/tree/main/extensions/todo-list),
author `maggie`, MIT, 10 contributors. Measured against the tree as cloned on 2026-11-10.

Upstream was already a locked, revision-checked JSON store rather than a `LocalStorage` key. The port is upstream
with the storage path changed, the Raycast-only features cut and the type errors the compiler found fixed.

## Scale

| | Upstream | Port |
| --- | --- | --- |
| Commands | 4 | 3 |
| Preferences | 5 | 3 |
| Runtime dependencies | 7 | 7 |
| Lines in `src/` | 1 596 | 1 377 |
| Test cases (`node --test`) | 31 | 27 |

Source files: 28 → 24. Removed `menu_bar.tsx`, `menu_bar_todo_item.tsx`, `queries.ts`, `tools/list-todos.ts`,
`tools/summarize-todos.ts`; added `path.ts`.

## Storage

Upstream wrote to `environment.supportPath/todo.json` (`~/.local/share/vicinae/support/todo-list/todo.json`). It
is now:

```
~/Documents/todo/2026-11-10/todo.json
~/Documents/todo/2026-11-10/todo.json.backup
```

The folder is the local date, not UTC: a task added at 23:59 stays in the day it was added. `src/path.ts` is the
whole change, and `config.ts` calls it once:

```ts
export const TODO_FILE = todoFileFor(new Date(), homedir());
```

Everything below the path is upstream unchanged:

- a `<file>.lock` created with `O_EXCL`, retried for 2 s, with a 10 s staleness break, so two commands cannot
  interleave a read and a write;
- compare-and-swap: every write carries the revision (the previous file text), and a mismatch raises
  `TodoRevisionConflictError` instead of overwriting;
- `<file>.backup` is written before the main file, and the main file is replaced by `rename` of a `wx` temporary
  with mode `0600`;
- import keeps a timestamped backup of the file it replaces, even when that file does not parse.

`TODO_FILE` is evaluated when the extension process starts. A command left open across midnight keeps writing to
the folder it opened in; the next launch uses the new day. Accepted: each launch is a new process, and the
alternative is a second clock read in every storage call. Per-day files also mean unfinished tasks do not follow
into the next day, and a pinned task stays in the file of the day it was pinned.

## What was cut

| Cut | Reason |
| --- | --- |
| `menu_bar` command, `menu_bar.tsx`, `menu_bar_todo_item.tsx` | `MenuBarExtra` is not in `@vicinae/api`. The command would be silently absent |
| `completed` preference | It only configured the menu bar: how many completed tasks it showed |
| `src/tools/*` | Vicinae has no AI tool host; nothing would register them |
| `src/queries.ts` | Search and summary for the tools above; only those two files imported it |
| `useConfetti` preference and `confetti()` | The function ran `open("raycast://confetti")`, a Raycast-only URL scheme |
| `getFavicon` from `@raycast/utils` | It asks Raycast's favicon service over the network. A URL action now uses `Icon.Globe01` |

The remaining use of `@raycast/utils` is `showFailureToast` in `backup_actions.tsx`; Vicinae resolves that package
at runtime, so it stays.

## Fixes the compiler found

| File | Change |
| --- | --- |
| all `src/` | `@raycast/api` → `@vicinae/api` |
| `shortcuts.ts` | One `{ key, modifiers }` shortcut instead of `{ macOS, Windows }` |
| `todo_item.tsx` | `Icon.Globe` → `Icon.Globe01`; `title={{ value, tooltip }}` → `title={string}` |
| `open_url_action.tsx` | `getFavicon(...)` → `Icon.Globe01` |
| `export-todos.tsx`, `import-todos.tsx` | Submit handler takes `Form.Values`; the selected folder or file is narrowed inside |
| `utils.ts`, `hooks/useTodo.ts`, three forms | `noUncheckedIndexedAccess`: the array and match results are asserted at the point they are proven present |

Vicinae's deserializer accepts a named string or one object:

```cpp
using ShortcutWire = std::variant<std::string, ShortcutObjWire>;
```

Upstream built the Raycast shape with explicit `macOS` and `Windows` objects; the deserializer sees neither key and
the shortcut disappears. The port maps Raycast's names to Vicinae's (`cmd` → `ctrl`, `opt` → `alt`) and returns the
one object. A check pins that shape.

`jotai` is pinned to `^2.6.0`. Version 3 exports no top-level `types` field and its conditional `exports` entry is
invisible to the `moduleResolution: node10` that `vici build` uses, so every `jotai` import fails to resolve.
Upstream's `^3.0.0` would not build here.

## Tests

`test/regressions.test.cjs` is upstream's suite, 31 cases, now 27:

- removed with their features: the menu-bar rows test, the menu-bar launch case in the toast test, and the AI
  search/summary cases — the revision-loop case now names a normal second command instead of a menu-bar save;
- rewritten: the shortcut check asserts the single object instead of the Raycast pair;
- added: `dayFolder` uses local time at both ends of a day, and `todoFileFor` produces
  `<home>/Documents/todo/YYYY-MM-DD/todo.json`.

The suite covers storage parse/reject/conflict/backup/import/export, tag discovery, the three forms'
close-on-success and close-on-failure behaviour, and failed writes leaving the UI untouched.
`test/load-source.cjs` transpiles the production TypeScript and mocks `@vicinae/api`, since a module importing it
cannot load headlessly.

## Verified live

- `vicinae://launch/@black/todo-list/index` logs `Loaded extension todo-list:index` with nothing after it; the
  stderr file stays empty.
- Typed `Buy bread` into the launcher with `ydotool`, pressed Return, and `~/Documents/todo/2026-11-10/todo.json`
  grew by that item; `.backup` appeared with the previous contents.
- Sections, tags, priority and pin icons render; the footer action is `Mark as Completed`.
