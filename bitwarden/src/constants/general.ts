/* Put constants that you still feel don't deserve a file of their own here */

import { Icon } from "~/utils/icons";
import { ItemType } from "~/types/vault";

export const DEFAULT_SERVER_URL = "https://bitwarden.com";

/**
 * Placeholder that the CLI substitutes for sensitive values. The extension
 * caches items with this marker so secrets never touch the on-disk cache.
 */
export const SENSITIVE_VALUE_PLACEHOLDER = "HIDDEN-VALUE";

export const LOCAL_STORAGE_KEY = {
  PASSWORD_OPTIONS: "bw-generate-password-options",
  PASSWORD_ONE_TIME_WARNING: "bw-generate-password-warning-accepted",
  VAULT_FAVORITE_ORDER: "vaultFavoriteOrder",
  SESSION_TOKEN: "sessionToken",
  REPROMPT_HASH: "sessionRepromptHash",
  SERVER_URL: "cliServer",
  LAST_ACTIVITY_TIME: "lastActivityTime",
  VAULT_LOCK_REASON: "vaultLockReason",
  VAULT_LAST_STATUS: "lastVaultStatus",
} as const;

export const VAULT_LOCK_MESSAGES = {
  TIMEOUT: "Vault timed out due to inactivity",
  MANUAL: "Manually locked by the user",
  SYSTEM_LOCK: "Screen was locked",
  CLI_UPDATED: "Bitwarden has been updated. Please login again.",
} as const;

export const FOLDER_OPTIONS = {
  ALL: "all",
  NO_FOLDER: "no-folder",
} as const;

export const CACHE_KEYS = {
  IV: "iv",
  VAULT: "vault",
  CURRENT_FOLDER_ID: "currentFolderId",
  CLI_VERSION: "cliVersion",
} as const;

export const ITEM_TYPE_TO_ICON_MAP: Record<ItemType, Icon> = {
  [ItemType.LOGIN]: Icon.Globe01,
  [ItemType.CARD]: Icon.CreditCard,
  [ItemType.IDENTITY]: Icon.Person,
  [ItemType.NOTE]: Icon.BlankDocument,
  [ItemType.SSH_KEY]: Icon.Key,
};
