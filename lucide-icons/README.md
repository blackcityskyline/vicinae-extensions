# Lucide Icons

Search the Lucide icon set in a grid. The colour comes from a dropdown, and the
primary action is a preference.

| Command | What it does |
| --- | --- |
| Search Icons | Grid of the whole set, filtered by name and keyword |

Preferences: **Primary Action** picks which of the five actions comes first;
**Copy Icon Name** switches the copied name to Pascal case.

## Ported from Raycast

Upstream, MIT: [Sn0wye/lucide-icons](https://github.com/raycast/extensions/tree/main/extensions/lucide-icons).

### What changed

**AI search is gone.** Upstream sends the whole icon list to an OpenAI model
when the local filter finds nothing. Vicinae's AI surface is not implemented
here, so the fallback would be a button that always fails.

**The colour list is Vicinae's.** Raycast has a larger palette; Vicinae's
`Color` enum has seven colours plus `PrimaryText` and `SecondaryText`. Those are
what the dropdown offers, and `tintColor` still accepts a raw value if a
preference ever needs one.

**One page at a time.** The grid opens with 60 icons and asks for the next 60
when the list is scrolled to the end. The filter runs over the full catalogue,
not the loaded page, and resets the page when the query changes.

**The catalogue is cached for a day.** All three `lucide.dev` endpoints are
fetched together on the first open; the built SVG strings go into a namespaced
`Cache`. After that the grid opens without the network.

**Shortcuts are explicit.** `cmd` is written as `cmd` and maps to Ctrl on
Linux; no per-platform shortcut objects.

## What leaves your machine

Three GET requests to `lucide.dev`, once per day. Copy, paste and the browser
action never send anything.
