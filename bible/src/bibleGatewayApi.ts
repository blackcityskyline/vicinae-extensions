import { URL, URLSearchParams } from "url";

import { normalizeQuery } from "./books";
import { parsePassages } from "./parse";
import type { BiblePassage, ReferenceSearchResult } from "./types";

/**
 * One request to biblegateway.com, then `src/parse.ts` over the answer.
 *
 * Upstream's parser is inlined here and reads `.bcv` and `span.chapternum`, both of which
 * are gone from the page today — see the comment at the top of `src/parse.ts` for the
 * counts and for what replaced them. Split out so it can be checked against the fetched
 * bytes instead of a sample.
 */
export async function search(query: string, version: string): Promise<ReferenceSearchResult> {
  // The site accepts no Russian book name: translate before it leaves.
  const url = createSearchUrl(normalizeQuery(query), version);
  const result = await fetch(url, { headers: { accept: "text/html" } });

  if (!result.ok) {
    throw new Error(`Bible Gateway answered ${result.status} ${result.statusText}`.trim());
  }

  const html = await result.text();

  // The search URL is the reference the user can open, so the scraper's own
  // `?interface=print` is taken back off.
  url.searchParams.delete("interface");

  return {
    version: versionOf(html),
    passages: parsePassages(html),
    copyright: copyrightOf(html),
    url,
  };
}

export function versionOf(html: string): string {
  // The strong element wraps a link: `<strong><a …>Name</a> (NRSVUE)</strong>`.
  // Matching text directly inside it found nothing, so the reference line ended
  // with an empty pair of parentheses.
  const strong = firstMatch(html, /publisher-info-bottom[^>]*>\s*<strong>([\s\S]*?)<\/strong>/);
  return strong ? stripTags(strong) : "";
}

export function copyrightOf(html: string): string {
  // The notice can hold links of its own ("by <a …>Public Domain</a>"), so the
  // text is taken from the whole paragraph and unwrapped rather than stopping at
  // the first child element.
  const paragraph = firstMatch(html, /publisher-info-bottom[\s\S]*?<p>([\s\S]*?)<\/p>/);
  return paragraph ? stripTags(paragraph) : "";
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function firstMatch(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
}

export function createSearchUrl(query: string, version: string): URL {
  const url = new URL("https://www.biblegateway.com/passage/");
  // Upstream's comment says the print view loads twice as fast.
  url.search = new URLSearchParams({ search: query, version, interface: "print" }).toString();
  return url;
}

export type { BiblePassage, ReferenceSearchResult };
