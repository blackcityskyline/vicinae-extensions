import { Cache } from "@vicinae/api";

import { fetchCatalog, type Result } from "~/api/codetoimage";
import { parseCatalog, type Catalog } from "~/utils/snippet";

const catalogCache = new Cache({
  namespace: "catalog",
  ttl: 7 * 24 * 60 * 60 * 1000,
});
const choiceCache = new Cache({ namespace: "last-used" });
const CATALOG_KEY = "options";

export async function loadCatalog(): Promise<Result<Catalog>> {
  const cached = catalogCache.get(CATALOG_KEY);
  if (cached) {
    const parsed = parseCatalog(cached);
    if (parsed) return { result: parsed };
  }

  const fetched = await fetchCatalog();
  if (fetched.result) {
    catalogCache.set(CATALOG_KEY, JSON.stringify(fetched.result));
  }
  return fetched;
}

export function lastChoices(): { language?: string; theme?: string } {
  return {
    language: choiceCache.get("language"),
    theme: choiceCache.get("theme"),
  };
}

export function rememberChoices(language: string, theme: string): void {
  choiceCache.set("language", language);
  choiceCache.set("theme", theme);
}
