# Audit: `markdown` → two upstreams, one merged extension

Sources, both from `raycast/extensions`:

- `ning_cao_cabeza/markdown-to-rich-text` — one `no-view` command, 30 lines
- `treyg/webpage-to-markdown` — one `view` command, 8 files, four preferences

They are merged into one extension, two commands, as the roadmap decided: both are "text
in, text out", both touch the clipboard, and the only thing they share is a name.

## What ships

| Command | Source | Change |
| --- | --- | --- |
| `markdown-to-rich-text` | `ning_cao_cabeza` | **rewritten**, 30 lines → 100, because the original cannot work here |
| `webpage-to-markdown` | `treyg` | upstream's `src/` unchanged, except its `types/index.ts` taken verbatim from upstream rather than rewritten |

## `markdown-to-rich-text`: rewritten, and why

Upstream is a `no-view` worker doing four steps: read the clipboard, convert, copy, paste.
**Two of the four do nothing here.** Measured in a `no-view` worker on this machine, and
the same numbers came up again in the url-kit audit:

```
Clipboard.readText()  -> ""
Clipboard.copy()      -> reports success, clipboard unchanged
```

Both work in a `view` worker — `view` reads the real value and `copy` really writes. So
the command became one: the clipboard is read on mount, shown in a `Form.TextArea`,
converted on submit. That is the same shape `url-kit` needs for the same reason.

It also buys something the original could not offer: a paste about to be made can be
looked at first.

## The rich part is real, and was checked rather than assumed

That was the roadmap's doubt — "Vicinae не умеет вставлять произвольный rich-text" — and
it is only half true. The clipboard carries both MIME types:

```
Clipboard.copy({html, text})  -> wl-paste --list-types: text/html text/plain text/plain;charset=utf-8
Clipboard.copy("plain")       -> wl-paste --list-types: text/plain text/plain;charset=utf-8 TEXT STRING UTF8_STRING
```

`text/html` is offered, and `wl-paste --type text/html` returns it intact.

The conversion, run live:

```
# Тест

Обычный **жирный** и *курсив*.

- пункт один
- пункт два

[ссылка](https://example.com)

| a | b |
|---|---|
| 1 | 2 |
```

becomes

```html
<h1>Тест</h1><p>Обычный <b>жирный</b> и <i>курсив</i>.</p><ul><li><p>пункт один</p></li>…
<p><a href="https://example.com">ссылка</a></p><table><tr><td><p>a</p></td>…
```

Headings, bold, italic, lists, links and tables all survive; Cyrillic is untouched. Note
`<b>` rather than `<strong>` — Contentful's own renderer, unchanged.

**What that gets you still depends on the application.** A terminal takes `text/plain` and
shows the plain text. Word and Google Docs read `text/html`. That part cannot be checked
from here, and is in `UNVERIFIED.md`.

The form closes **before** pasting. The other way round the form still holds focus and the
text lands in it — the ordering Vicinae's own `Action.Paste` uses, and the one that was
measured wrong in the downloads manager.

## `webpage-to-markdown`: unchanged, and it cannot work without a key

The roadmap said "нужен HTTP-клиент; Node 26 даёт встроенный `fetch`, зависимость не
нужна". **That was wrong.** The extension does not fetch the page — it asks
`r.jina.ai` to, and that is the whole extraction:

```ts
const jinaUrl = `https://r.jina.ai/${url}`;
```

Measured from this machine:

```
https://r.jina.ai/https://example.com                     451
https://r.jina.ai/https://en.wikipedia.org/wiki/Markdown   451
with `Authorization: Bearer x`                             451
```

`Unavailable For Legal Reasons`, 29 bytes, and a key changes nothing. So the command
cannot be verified end to end here. It ships with upstream's own optional `jinaApiKey`
preference, and fails **loudly and specifically** without one:

```
Error converting URL: Error: Failed to fetch markdown: Unavailable For Legal Reasons
```

which is `showFailureToast` doing its job. That is upstream's situation too — the key is
optional there as well.

The roadmap's line about "нужен HTTP-клиент" also ignores that upstream pulls `node-fetch`
in, which is dead weight on Node 26 but is upstream's dependency and was left alone.

## A check that was wrong before the code was

The first version of the heading check asserted that a page starting with `## Sub` must
not get `# Example` above it. It failed, and the check was wrong rather than the code:
Contentful/Jina content starting at h2 with the page title as h1 above it is the document
reading properly. Upstream's guard is `startsWith("# ")` — exactly — because the
duplication worth avoiding is the title appearing twice as an h1. The check now asserts
both halves of that.

## Verified

| | |
| --- | --- |
| `lint`, `check`, `test`, `build` | clean; 8 checks |
| both commands load | yes, no crash |
| rich-text conversion | h1, bold, italic, ul/li, links, tables, Cyrillic |
| clipboard MIME types | `text/html` present with `{html, text}`, absent with a plain string |
| paste ordering | window closes first, read out of the source |
| title duplication | only avoided for an exact leading h1 |
| links summary | sorted, only when asked for |
| `webpage-to-markdown` without a key | 451, and the message names the cause |

## Not verified

In `UNVERIFIED.md`. The important gap: **whether Word, Google Docs or LibreOffice actually
receive the rich text.** A terminal cannot answer that, and it is the entire point of the
command.
