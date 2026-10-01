/**
 * `@raycast/utils` for a plain `tsx` run.
 *
 * The package ships types only; the real module comes from the Vicinae runtime. Only the
 * two names `src/utils.tsx` imports are provided, and `showFailureToast` throws rather than
 * resolving, so a check that reaches for it fails instead of quietly passing.
 */

export async function showFailureToast(error: unknown, _options?: unknown): Promise<void> {
  throw new Error(`showFailureToast was called in a test: ${String(error)}`);
}
