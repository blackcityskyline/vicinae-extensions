import { Cache as VicinaeCache } from "@vicinae/api";

/**
 * Shared on-disk cache. Items are stored encrypted (see `useVaultCaching`), so
 * this namespace must stay stable across versions.
 */
export const Cache = new VicinaeCache({ namespace: "bw-cache" });
