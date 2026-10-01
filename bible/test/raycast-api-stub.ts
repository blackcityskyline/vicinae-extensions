/**
 * `@raycast/api` ships types only; Vicinae injects the real module. `src/parse.ts` is
 * pure and imports neither, but the test imports `tsconfig.test.json`'s paths, so the
 * alias has to resolve to something.
 */
export const environment = { raycastVersion: "1.0.0", extensionName: "bible", commandName: "test" };
