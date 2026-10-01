/**
 * The parts of `@raycast/api` and `@raycast/utils` that `src/` touches while it loads.
 *
 * Both packages ship types and nothing else — the real modules are injected by the
 * Vicinae runtime — so a plain `tsx` run cannot `require` them. Only what runs at import
 * time is here: a cache, the preferences, the local storage, and the enums read at
 * module scope.
 *
 * Everything else the extension calls needs a window and is deliberately not stubbed: a
 * check that could pass against a stub would be a check that proves nothing.
 */

const stored = new Map<string, string>();

export class Cache {
  get(key: string): unknown {
    return stored.get(`cache:${key}`);
  }

  set(key: string, value: unknown): void {
    stored.set(`cache:${key}`, String(value));
  }
}

/** No preferences: the fixture folder is picked up from `$HOME` instead. */
export function getPreferenceValues<T>(): T {
  return {} as T;
}

export const LocalStorage = {
  async getItem<T>(key: string): Promise<T | undefined> {
    return stored.get(`ls:${key}`) as T | undefined;
  },
  async setItem(key: string, value: unknown): Promise<void> {
    stored.set(`ls:${key}`, String(value));
  },
  async removeItem(key: string): Promise<void> {
    stored.delete(`ls:${key}`);
  },
  async allItems(): Promise<Record<string, string>> {
    return {};
  },
  async clear(): Promise<void> {
    stored.clear();
  },
};

export const Toast = {
  Style: { Success: "success", Failure: "failure", Animated: "animated" },
} as const;

export const Alert = {
  ActionStyle: { Destructive: "destructive", Cancel: "cancel", Default: "default" },
} as const;

export async function showHUD(_title: string): Promise<void> {}
export async function showToast(_options: unknown): Promise<unknown> {}

// Never called by the checks, and throwing keeps an accidental call from passing quietly.
export async function confirmAlert(_options: unknown): Promise<boolean> {
  throw new Error("confirmAlert needs a window; a check must not depend on it");
}

export async function trash(_path: string | string[]): Promise<void> {
  throw new Error("trash() in Vicinae is rm -r, which is why src/trash.ts exists");
}

export async function getFrontmostApplication(): Promise<{ name: string }> {
  return { name: "" };
}

// Components. Never rendered: the checks read files, they do not draw.
export const Action = {} as never;
export const ActionPanel = {} as never;
export const Detail = {} as never;
export const Grid = {} as never;
export const List = {} as never;
export const Icon = {} as never;
export const Keyboard = { Shortcut: { Common: {} as Record<string, string> } } as never;
export const Clipboard = {} as never;
