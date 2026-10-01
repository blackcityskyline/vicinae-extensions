/**
 * The shared value store behind `useStored`.
 *
 * The reference uses Raycast's `useCachedState`, which is not per-component state
 * with a write to disk — it is one shared value per key, and every hook reading
 * that key sees a write from any of them, immediately.
 *
 * That difference is the whole bug it caused here. The language set is written
 * from the dropdown in the search bar accessory and from the actions inside the
 * rows, while the list reads it. With per-instance state the write went nowhere
 * the list could see, and the target stayed `en,en` no matter what the dropdown
 * was set to.
 *
 * Pure, so it can be checked without React: `test/store.test.ts`.
 */

type AnyListener = (value: never) => void;

const entries = new Map<string, { value: unknown; listeners: Set<AnyListener> }>();
const readFromDisk = new Set<string>();

function entryFor(key: string) {
  const existing = entries.get(key);
  if (existing) return existing;

  const created = { value: undefined, listeners: new Set<AnyListener>() };
  entries.set(key, created);
  return created;
}

/** The shared value, or the fallback when nothing has written this key yet. */
export function read<T>(key: string, fallback: T): T {
  const entry = entries.get(key);
  return entry === undefined ? fallback : (entry.value as T);
}

/** Write the shared value and tell every subscriber, in this process, at once. */
export function write<T>(key: string, value: T): void {
  const entry = entryFor(key);
  entry.value = value;

  for (const listener of [...entry.listeners]) (listener as (value: T) => void)(value);
}

export function subscribe<T>(key: string, listener: (value: T) => void): () => void {
  const entry = entryFor(key);
  const wrapped = listener as AnyListener;
  entry.listeners.add(wrapped);

  return () => {
    entry.listeners.delete(wrapped);
  };
}

/** Whether the value has been read from disk yet, so only one caller does it. */
export function needsDiskRead(key: string): boolean {
  return !readFromDisk.has(key);
}

export function markDiskRead(key: string): void {
  readFromDisk.add(key);
}