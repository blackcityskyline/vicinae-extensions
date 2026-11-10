/** A URL to open, resolved from whatever the user typed. */
export function toUrl(input: string): string {
  const text = input.trim();
  if (text === "") return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (/^(about|chrome|data|file|mailto|view-source):/i.test(text)) return text;
  // Spaces only mean a search: a URL cannot contain one, a query always can.
  if (/\s/.test(text)) return searchUrl(text);
  if (/^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.(localhost|test))(:\d+)?([/?#].*)?$/i.test(text)) {
    return `http://${text}`;
  }
  if (/^([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return `https://${text}`;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(text)) return `https://${text}`;
  return searchUrl(text);
}

export function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** Host of a URL, or undefined when it does not parse. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/** The host without a leading `www.`, for comparing two pages of the same site. */
export function bareHost(url: string): string | undefined {
  return hostOf(url)?.replace(/^www\./, "");
}
