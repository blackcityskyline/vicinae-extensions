import { environment, getPreferenceValues } from "@vicinae/api";
import { VAULT_TIMEOUT_MS_TO_LABEL } from "~/constants/labels";
import { CommandName } from "~/types/general";

export function getServerUrlPreference(): string | undefined {
  const { serverUrl } = getPreferenceValues<Preferences>();
  return !serverUrl || serverUrl === "bitwarden.com" || serverUrl === "https://bitwarden.com" ? undefined : serverUrl;
}

type TransientOptionsValue = "always" | "passwords" | "never";

/** Each command with a copy action owns its own "copy temporarily" preference. */
const COMMAND_TO_TRANSIENT_PREFERENCE: Partial<Record<CommandName, string>> = {
  search: "transientCopySearch",
  "generate-password": "transientCopyGeneratePassword",
  "generate-password-quick": "transientCopyGeneratePasswordQuick",
};

/**
 * Whether a copied value should be concealed from the clipboard history.
 *
 * Concealed selections are not indexed, so a password never lands in the
 * clipboard manager's searchable store.
 */
export function getTransientCopyPreference(type: "password" | "other"): boolean {
  const key = COMMAND_TO_TRANSIENT_PREFERENCE[environment.commandName as CommandName];
  if (!key) return false;

  const value = (getPreferenceValues() as Record<string, unknown>)[key] as TransientOptionsValue | undefined;
  if (value === "never") return false;
  if (value === "always") return true;
  if (value === "passwords") return type === "password";
  return true;
}

export function getLabelForTimeoutPreference(timeout: string | number): string | undefined {
  return VAULT_TIMEOUT_MS_TO_LABEL[timeout as keyof typeof VAULT_TIMEOUT_MS_TO_LABEL];
}
