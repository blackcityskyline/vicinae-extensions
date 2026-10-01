import type { LanguageCodeSet } from "~/types";
import { asLanguage } from "~/utils/languages";

export function isSameLanguageSet(one: LanguageCodeSet, two: LanguageCodeSet): boolean {
  return one.langFrom === two.langFrom && one.langTo.join() === two.langTo.join();
}

export function getLanguageSetObjects(languageSet: LanguageCodeSet) {
  return {
    langFrom: asLanguage(languageSet.langFrom),
    langTo: languageSet.langTo.map(asLanguage),
  };
}

export function formatLanguageSet(languageSet: LanguageCodeSet): string {
  const { langFrom, langTo } = getLanguageSetObjects(languageSet);
  return `${langFrom.name} -> ${langTo.map((language) => language.name).join(", ")}`;
}

/** The translation on Google's own site. Verified 200 with text in the query. */
export function websiteUrl(from: string, to: string, text: string): string {
  const query = new URLSearchParams({ sl: from, tl: to, text, op: "translate" });
  return `https://translate.google.com/?${query}`;
}

/**
 * Read back what `useStored` wrote, or keep the default.
 *
 * Measured on a fresh install: `LocalStorage.getItem` resolves with `null`, not
 * `undefined`, even though its type says `undefined` — and `JSON.parse(null)` is
 * `null`. Guarding for `undefined` alone let that through, and every command then
 * read `.langFrom` off a null and crashed on its first launch. So the guard is on
 * what comes back and on what comes out of the parse.
 *
 * `false` and `0` are values, not absence.
 */
export function parseStored<T>(stored: unknown, fallback: T): T {
  if (typeof stored !== "string") return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return fallback;
  }

  return parsed === null ? fallback : (parsed as T);
}
