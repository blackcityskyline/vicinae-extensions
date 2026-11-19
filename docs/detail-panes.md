# Detail panes: the cover card

How to build a `List.Item.Detail` that looks designed rather than defaulted — the
layout `player-pilot` and `ytmusic` use. Read this before drawing a picture in a
pane.

## What the pane actually gives you

- Markdown on top, an optional `metadata` bar under it. The bar has a fixed
  height; markdown gets the rest. Short markdown does not shrink the pane — the
  leftover stays as a gap *above* the bar, which is the "dead space under the
  title" everyone notices first.
- A markdown image is capped by the renderer (`MdImage.qml`) at
  `min(200, 0.7 × markdown height)`. One cover therefore cannot fill a pane, and
  the quarter under it stays empty.
- The image is drawn at the pane's content width regardless of the declared
  height: in a 772 px window that is ~470 px, a 1.12 scale. `?raycast-width/-height`
  sizes the box; it does not promise the shape.
- The pane of **every** row is mounted, not only the selected one — measured:
  ten panes for a ten-row `List`. Anything a pane fetches, every row fetches.

Consequences, in order:

1. Drop the `metadata` bar when the pane is a picture. Put the facts in a card.
2. Fill the pane with two cards, not one image: cover on top, facts under it.
   Two 420×180 cards fit a 772 px window; 420×200 + 420×170 is squeezed, and
   the second card gets clipped at the bottom.
3. Keep the title and the artist inside a card. Text under a card is what
   created the gap in the first place.
4. A card is an image: nothing in it is clickable. Whatever the bar offered as a
   `Metadata.Link` becomes an `Action` with a shortcut.

## A card is SVG in a data URI

`src/lib/pane.ts` (ytmusic) and `src/lib/cards.ts` (player-pilot) are the two
working examples.

- Compose the block as SVG, then embed it:
  ```ts
  const encoded = encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29");
  `![](data:image/svg+xml?raycast-width=${W}&raycast-height=${H}#x,${encoded})`
  ```
  The query must sit after `data:image/svg+xml` and before the comma: that comma
  is where the parser splits (`markdown-model.cpp` → `parseImageSize`). The `#x`
  fragment keeps the query out of the payload.
- Text goes into the SVG, so it must be escaped (`&`, `<`, `>`, quotes) and cut
  with an ellipsis (`fit`/`cut`) — a card has no room to wrap or shrink.
- Draw at 2× when the pane will widen the card: the pane renders at ~1.12×, which
  makes 1× text slightly soft. `player-pilot` and `ytmusic` draw at 2× for that reason.
- Use a system font stack, not a named family that may be missing.

## The picture has to be fetched by the extension

Qt's SVG module does not load remote images, so a data-URI card cannot reference
`https://` — the bytes must be inlined:

- `fetch` the picture, measure its real shape from the header bytes
  (`imageSize`), and keep it as `data:<mime>;base64,…` in a small per-process
  map (`utils/artwork.ts`). Never assume square or 16:9: YouTube serves square
  album art, 16:9 video frames and 4:3 letterboxed thumbnails.
- Frame the picture in the card — the same picture scaled to fill and dimmed as
  a backdrop, the cover fitted on top with rounded corners — so any source shape
  looks deliberate instead of stretched.
- Ask the CDN for its largest frame (`maxresdefault.jpg`, 1280×720) and keep the
  4:3 one as a fallback: `hqdefault` bakes black bars into the picture, and not
  every upload has the big one (12 of 99 in one real queue). Measure that before
  trusting either.
- Because every pane mounts, fetch only for the selected row:
  `onSelectionChange` + `List.Item id`, the card for the selected row, plain
  markdown for the rest. Otherwise opening a hundred-row queue downloads a
  hundred covers.

## Layout that reads well

- Cover card: picture, no text. Info card: title (21 px bold), subtitle
  (13 px, 0.62), a hairline divider, then label/value rows (10 px caps left,
  14 px right-aligned). No plate under either card: the SVG is transparent, so
  the card sits on the pane's own background and follows the launcher's theme.
  `#e6e7ea` ink is the one colour left, and it is light-theme wrong.
- Facts the row already shows in the list are not repeated in the pane; the pane
  adds what the row cannot say.
- A fact with a row of its own drops the subtitle: a playlist pane carries the
  owner as `Author:`, so repeating it under the title is the same name twice.
- Free text — a playlist's, an album's or an artist's description — is drawn at
  the foot of the info card, two 11 px lines, the last one cut: a card does not
  scroll, and the row's own page is where the whole text belongs. The rows
  share the space above it instead of the pane growing a third block.
- A description belongs to the page it describes, not to the preview of that
  page: a playlist row's pane carries the facts, the opened playlist carries
  the text too.
- Numbers, not adjectives: a value that came from minutes and seconds is
  `2:38 / 4:16`, a position is `3 of 10` — and after filtering or reordering,
  number the list you show, not the source list.

## Verify on screen

- `npm run build` is the install; a failed build silently leaves the old bundle,
  so check the installed JS mtime before judging the picture.
- Take a screenshot and measure the pane: crop the pane, scan a column for the
  card edges, compare heights. A card that "looks fine" can be clipped by 20 px.
- Launching a command that is already mounted does not remount it; launch
  another command first.
