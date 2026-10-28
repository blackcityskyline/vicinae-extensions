/**
 * `@vicinae/api` for a plain `tsx` run.
 *
 * The package is injected by the Vicinae runtime and throws if it is imported
 * outside one, so the checks below point the module at this file instead. Only what
 * `src/` touches while it loads or while the tested functions run is here; anything
 * that would need a window throws rather than pretending to work, so a check cannot
 * pass against a stub.
 *
 * Preferences arrive as JSON in `ISKRA_TEST_PREFS`, which lets a check describe a
 * configuration without reaching into the runtime.
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

export function getPreferenceValues<T>(): T {
  return JSON.parse(process.env.ISKRA_TEST_PREFS ?? "{}") as T;
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
};

export const Toast = {
  Style: { Success: "success", Failure: "failure", Animated: "animated" },
} as const;

export const Icon = new Proxy({}, { get: (_target, name) => String(name) }) as never;

export const Clipboard = {
  async copy(): Promise<void> {},
  async paste(): Promise<void> {},
};

export const environment = {
  canAccess: () => false,
  supportPath: "/tmp/iskra-test-support",
};

export async function showToast(): Promise<void> {}
export async function showHUD(): Promise<void> {}
export async function closeMainWindow(): Promise<void> {}
export async function openExtensionPreferences(): Promise<void> {}

// Needs a window and a user; throwing keeps an accidental call from passing quietly.
export async function confirmAlert(): Promise<boolean> {
  throw new Error("confirmAlert needs a window");
}

export function useNavigation(): { push: () => void; pop: () => void } {
  return { push: () => {}, pop: () => {} };
}

export const Action = {} as never;
export const ActionPanel = {} as never;
export const Detail = {} as never;
export const Form = {} as never;
export const Grid = {} as never;
export const List = {} as never;
export const Keyboard = { Shortcut: { Common: {} } } as never;
