import { getPreferenceValues } from "@raycast/api";
import {
  SearchParams,
  SearchResponse,
  WallpaperResponse,
  CollectionsResponse,
} from "./types";

const BASE_URL = "https://wallhaven.cc/api/v1";

function getHeaders(): Record<string, string> {
  const { apiKey } = getPreferenceValues<Preferences>();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again.",
      );
    }
    if (response.status === 401) {
      throw new Error(
        "Unauthorized. Check your API key in extension preferences.",
      );
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Build the query for one search. Pure, and separate from the request, because this is
 * where the combination rules live: every filter and the sort mode go in the same request,
 * and `topRange` only means anything for `toplist`.
 *
 * Upstream assembled this inline, and the picker it fed made filters and sorting mutually
 * exclusive — one dropdown with one `storeValue` can only show the last thing you picked, so
 * picking a category looked like it cleared the sort mode. The API never required that.
 * Measured on wallhaven.cc today:
 *
 *   `?q=nature&categories=100&purity=100&sorting=relevance`  → total 67086
 *   `?q=nature&categories=100&purity=100&sorting=date_added` → total 67086, different ids
 *
 * `q` is omitted rather than sent empty when the search box is blank. The two are not the
 * same request: `?q=&...&sorting=relevance` answers total 337562, where omitting `q`
 * answers a different set entirely.
 */
export function buildSearchQuery(params: SearchParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.categories) query.set("categories", params.categories);
  if (params.purity) query.set("purity", params.purity);
  if (params.sorting) query.set("sorting", params.sorting);
  if (params.order) query.set("order", params.order);
  if (params.topRange && params.sorting === "toplist") {
    query.set("topRange", params.topRange);
  }
  if (params.page) query.set("page", String(params.page));
  if (params.seed) query.set("seed", params.seed);
  return query;
}

export async function searchWallpapers(
  params: SearchParams,
): Promise<SearchResponse> {
  const url = new URL(`${BASE_URL}/search`);
  const query = buildSearchQuery(params);
  if ([...query].length) url.search = query.toString();
  return fetchJSON<SearchResponse>(url.toString());
}

export async function getWallpaper(id: string): Promise<WallpaperResponse> {
  return fetchJSON<WallpaperResponse>(`${BASE_URL}/w/${id}`);
}

export async function getCollections(): Promise<CollectionsResponse> {
  return fetchJSON<CollectionsResponse>(`${BASE_URL}/collections`);
}

export async function getCollectionWallpapers(
  username: string,
  id: number,
  page: number = 1,
): Promise<SearchResponse> {
  const url = new URL(
    `${BASE_URL}/collections/${encodeURIComponent(username)}/${id}`,
  );
  url.searchParams.set("page", String(page));
  return fetchJSON<SearchResponse>(url.toString());
}
