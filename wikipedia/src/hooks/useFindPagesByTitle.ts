import { useFetch } from "@raycast/utils";
import { useMemo } from "react";

import { apiBase, type Locale } from "~/utils/language";
import { requestHeaders } from "~/utils/api";

interface SearchResult {
	pageid: number;
	title: string;
}

interface SearchResults {
	query?: { search?: SearchResult[] };
}

export default function useFindPagesByTitle(search: string, language: Locale) {
	const url = useMemo(() => {
		const url = new URL(`${apiBase(language)}w/api.php`);
		url.searchParams.set("action", "query");
		url.searchParams.set("list", "search");
		url.searchParams.set("format", "json");
		url.searchParams.set("srsearch", search);
		url.searchParams.set("srlimit", "9");
		return url.toString();
	}, [search, language]);

	return useFetch<{ language: Locale; results: SearchResult[] }>(url, {
		headers: requestHeaders(language),
		keepPreviousData: true,
		parseResponse: (response) =>
			response
				.json()
				.then((data: SearchResults) => data.query?.search ?? [])
				.then((results) => results.filter((page, index, self) => self.findIndex((p) => p.pageid === page.pageid) === index))
				.then((results) => ({ language, results })),
	});
}
