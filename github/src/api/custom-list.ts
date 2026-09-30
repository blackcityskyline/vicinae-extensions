import { LocalStorage } from "@vicinae/api";

import type { Repository } from "./github.ts";
import {
  isInCustomList,
  parseCustomList,
  serializeCustomList,
  toggleInCustomList,
} from "../utils/custom-list.ts";

/**
 * The user's own list of repositories.
 *
 * Stored locally rather than on GitHub: it is a launcher convenience, not
 * something to push to an account, and it needs no token scope, so it works with
 * a read-only token. The parsing and list algebra live in
 * `src/utils/custom-list.ts` because stored values are not trustworthy and the
 * tests cannot import this module.
 */

const STORAGE_KEY = "custom-repositories";

export async function readCustomList(): Promise<Repository[]> {
  try {
    return parseCustomList(await LocalStorage.getItem<string>(STORAGE_KEY));
  } catch (error) {
    console.error("could not read the custom list:", (error as Error).message);
    return [];
  }
}

async function writeCustomList(list: readonly Repository[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, serializeCustomList(list));
}

/** Add or remove, then persist. Returns the new membership state. */
export async function toggleListed(repository: Repository): Promise<boolean> {
  const next = toggleInCustomList(await readCustomList(), repository);
  await writeCustomList(next);
  return isInCustomList(next, repository.full_name);
}
