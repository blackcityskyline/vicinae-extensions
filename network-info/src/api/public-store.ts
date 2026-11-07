import { Cache } from "@vicinae/api";

import { fetchPublicIp, type PublicInfo } from "./public.ts";

const cache = new Cache();
const KEY = "public-ip";
const FRESH_MS = 300_000;

interface Stored {
	info: PublicInfo;
	at: number;
}

function readStored(): Stored | null {
	const raw = cache.get(KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Stored;
		return parsed && typeof parsed.at === "number" && parsed.info?.ip ? parsed : null;
	} catch {
		return null;
	}
}

export async function getPublicIp(force = false): Promise<PublicInfo> {
	const stored = readStored();
	if (!force && stored && Date.now() - stored.at < FRESH_MS) return stored.info;
	const fresh = await fetchPublicIp();
	if (fresh.ip) {
		cache.set(KEY, JSON.stringify({ info: fresh, at: Date.now() } satisfies Stored));
		return fresh;
	}
	// Upstream serves a stale answer rather than none when the fetch fails.
	if (stored) return { ...stored.info, status: "stale" };
	return fresh;
}