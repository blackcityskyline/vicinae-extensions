# Audit: `vim-bro` → upstream deployed, one runtime fix

Source: `raycast/extensions`, `extensions/vim-bro` — author `ajaypremshankar`, four
contributors. Four source files, one of them the data.

## What ships

Upstream `src/`, deployed. One file differs, in five lines.

| File | Change |
| --- | --- |
| `src/index.tsx` | `favorites = value ?? []` instead of a destructuring default |

## The one thing that did not survive

It crashed on first launch, every time:

```
TypeError: Cannot read properties of null (reading 'includes')
```

Upstream wrote:

```ts
const { value: favorites = [] } = useLocalStorage<string[]>("vim-favorites");
```

That default is correct for Raycast, where an absent key is `undefined`. Here it is
`null`, and the difference is between the published package and the module Vicinae
injects:

```js
// node_modules/@vicinae/api/dist/api/local-storage.js
const value = await getClient().Storage.get(key);
return value ?? undefined;                     // coerces

// /run/user/1000/vicinae/extension-manager.js — what require("@vicinae/api") resolves to
async function c(V){ return pe().Storage.get(V) }   // no coercion
```

So an absent key arrives as `null`, `useLocalStorage` runs
`typeof item !== "undefined" ? JSON.parse(item) : initialValue`, and `JSON.parse(null)`
is `null`. A destructuring default fires on `undefined` only, so `favorites` stayed
`null` and `.includes` on it threw.

A check reads the source and fails if the `?? []` is tidied away or the destructuring
default comes back. Verified by putting the default back: it fails.

## The open question in the roadmap, answered

The roadmap recorded three possible data sources for this extension and called the
dataset the only one that would give a real search over descriptions. **All three were
wrong about the code.** Upstream ships `src/commands.json`:

| | |
| --- | --- |
| groups | 12 |
| commands | 181 |
| size | 18 219 bytes |

So there is no parsing of nvim's help files, no network fetch, and nothing to keep up to
date — 135 files of vim help sit unused on this machine at `/usr/share/nvim/runtime/doc/`.

The shape is `{key, commands: [{kbd, text}]}`, e.g. `{"kbd": ":h[elp] keyword", "text":
"open help for keyword"}`.

## Manifest

Upstream's except `platforms`, scripts, author and the icon filename. One real edit:
the extension title was `Vim Bro - Search Vim Commands` and its only command is
`Search Commands`, so the launcher showed *Search Commands Vim Bro - Search Vim Commands*
— the same words twice on every row. Title is now `Vim Bro`.

Categories `Productivity`, `Developer Tools`, `Documentation` are all valid in Vicinae
and are kept.

## Features upstream's own README lists as not built

Kept as not built, since they are the reference's roadmap and not its code: command
lookup (find what a command *does* by typing the command), and command of the day.

## Verified

| | |
| --- | --- |
| `lint`, `check`, `test`, `build` | clean; 7 checks |
| command loads | `Loaded` → `Started` → `Unloaded … (ran for 10.745s)`, no crash |
| after the fix, crashes | none |
| the dataset | 12 groups, 181 commands, every one with both `kbd` and `text` |
| search narrows | an empty search changes nothing; `split` matches and holds commands |
| ordering | a group matching on its name comes before one matching inside a command |
| a group with nothing left | comes back empty, not missing, so sections stay |
| `formatCommandForClipboard` | `:w` → `w`, `%s/a/b/g` keeps its shape |

## Not verified

In `UNVERIFIED.md`. Nothing here was looked at: the list rendering, the search bar, the
All/Favorites dropdown, the favourites round-trip through `LocalStorage`, and whether a
favourite survives a restart. The checks read files; they do not draw.

One consequence of the fix worth knowing: the favourites key is `vim-favorites` in a
fresh `LocalStorage`, so the list starts empty. Nothing is lost — it had never been
writable here, since the first launch crashed.
