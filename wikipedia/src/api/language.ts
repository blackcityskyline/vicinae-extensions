import { Cache } from "@vicinae/api";
import { useCachedState } from "@raycast/utils";

import type { Locale } from "~/utils/language";

/** Shared by every command, so a language picked once survives a relaunch. */
export const LANGUAGE_KEY = "language";

export function useLanguage() {
	return useCachedState<Locale>(LANGUAGE_KEY, "en");
}

/**
 * The same cache `useCachedState` writes, decoded by hand: a `no-view` command
 * has no React tree to mount the hook in.
 */
export async function storedLanguage(): Promise<Locale> {
	const raw = await new Cache().get(LANGUAGE_KEY);
	if (!raw) return "en";
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "string" ? (parsed as Locale) : "en";
	} catch {
		return "en";
	}
}
