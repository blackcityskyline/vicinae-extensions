/**
 * `@raycast/api` ships types only; Vicinae injects the real module at runtime.
 * `src/utils.ts` imports `getPreferenceValues` and `environment` from it, and
 * `test/skwd.test.ts` exercises that file, so `tsconfig.test.json` maps the alias here.
 */

let overrides: Record<string, unknown> = {};

export const environment = {
  raycastVersion: "1.0.0",
  extensionName: "wallhaven",
  commandName: "test",
  supportPath: "/tmp/opencode/wallhaven-test",
};

export function getPreferenceValues<T>(): T {
  return { backend: "auto", ...overrides } as T;
}

/** Lets a test stand in for a preference value without writing one to disk. */
export function setPreferenceOverrides(values: Record<string, unknown>): void {
  overrides = values;
}