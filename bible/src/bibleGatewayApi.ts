import { URL, URLSearchParams } from "url";

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
  const url = createSearchUrl(query, version);
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

function versionOf(html: string): string {
  return firstMatch(html, /publisher-info-bottom[^>]*>\s*<strong>([^<]*)<\/strong>/) ?? "";
}

function copyrightOf(html: string): string {
  return firstMatch(html, /publisher-info-bottom[\s\S]*?<p>([^<]*)<\/p>/)?.trim() ?? "";
}

function firstMatch(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
}

function createSearchUrl(query: string, version: string): URL {
  const url = new URL("https://www.biblegateway.com/passage/");
  // Upstream's comment says the print view loads twice as fast.
  url.search = new URLSearchParams({ search: query, version, interface: "print" }).toString();
  return url;
}

export type { BiblePassage, ReferenceSearchResult };
