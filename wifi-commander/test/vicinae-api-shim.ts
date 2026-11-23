/**
 * A stand-in for `@vicinae/api`, for the headless checks only.
 *
 * That package reads the launcher environment while it is being imported and
 * throws outside it, so anything that touches `src/api/` is unimportable from a
 * plain `tsx` run. This shim is wired in through `tsconfig.json` paths below.
 */

export async function showToast(arg: { title?: string; message?: string }): Promise<void> {
  void arg;
}
