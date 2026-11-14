# Markdown

Markdown to rich text, and a web page to Markdown.

| Command | Does |
| --- | --- |
| Markdown to Rich Text | converts the clipboard's Markdown and pastes it as rich text |
| Webpage to Markdown | converts a page through Jina AI; takes a `url` argument |

Markdown to Rich Text is a `view` command because a `no-view` worker gets an
empty clipboard and a `copy` that reports success without writing. The clipboard
is read on mount into an editable field, converted on submit, and the result is
placed on the clipboard with the HTML and plain-text flavours.

Webpage to Markdown needs a **Jina API Key**; **Include Metadata**, **Prepend
Front Matter** and **Include Links Summary** shape the output. Nothing is sent
anywhere but Jina.

Merged from `ning_cao_cabeza/markdown-to-rich-text` and
`treyg/webpage-to-markdown`; the first was rewritten.
