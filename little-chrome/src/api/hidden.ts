import { LocalStorage } from "@vicinae/api";

import { emptyBlocklist, type Blocklist } from "~/utils/blocklist.ts";

/** Kept per browser and profile: the same machine can run two Chromium-family browsers. */
const key = (browser: string, profile: string): string => `little-chrome:blocklist:${browser}:${profile}`;

export async function loadBlocklist(browser: string, profile: string): Promise<Blocklist> {
  const raw = await LocalStorage.getItem<string>(key(browser, profile));
  if (!raw) return emptyBlocklist();
  try {
    const parsed = JSON.parse(raw) as Partial<Blocklist>;
    return {
      urls: Array.isArray(parsed.urls) ? parsed.urls.filter((entry): entry is string => typeof entry === "string") : [],
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts.filter((entry): entry is string => typeof entry === "string") : [],
    };
  } catch {
    return emptyBlocklist();
  }
}

export async function saveBlocklist(browser: string, profile: string, blocklist: Blocklist): Promise<void> {
  await LocalStorage.setItem(key(browser, profile), JSON.stringify(blocklist));
}
