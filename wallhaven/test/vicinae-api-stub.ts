/**
 * `@vicinae/api` is injected by the Vicinae runtime, not installed. `src/utils.ts` imports
 * `Wallpaper` from it for the swww/awww/hyprpaper rows.
 *
 * Only the Skwd Wall row is exercised by the tests — the other three route through
 * `Wallpaper.set`, which cannot be reached here without `swww` or `awww` installed. So this
 * stub records the call rather than performing it, which lets a test assert that the
 * Vicinae-routed backends are *not* being bypassed by the argv path.
 */

export const Wallpaper = {
  calls: [] as { path: string; fit?: string }[],
  async set(path: string, options?: { fit?: string }): Promise<void> {
    Wallpaper.calls.push({ path, ...options });
  },
};