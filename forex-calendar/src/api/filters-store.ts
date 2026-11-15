import { Cache } from "@vicinae/api";

import { parseFilters, type Filters } from "~/utils/filters";

// Its own namespace, so a full feed cache can never push the user's choice out.
const cache = new Cache({ namespace: "filters" });
const KEY = "filters";

export const readFilters = (): Filters => parseFilters(cache.get(KEY));

export const writeFilters = (filters: Filters): void => cache.set(KEY, JSON.stringify(filters));
