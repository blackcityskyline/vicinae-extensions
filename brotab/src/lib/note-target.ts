/**
 * Where a note written from the search bar belongs. A scheme (`https:`, `file:`)
 * or a bare domain is a page, so the text goes into the URL field; anything else
 * is something the user wanted to write down, so it goes into the body.
 */
export function looksLikeUrl(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(trimmed)) return true;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(trimmed);
}
