import { Action, Clipboard, Keyboard, showToast, Toast } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import ActionWithReprompt, { ActionWithRepromptProps } from "~/components/actions/ActionWithReprompt";
import { useSelectedVaultItem } from "~/components/searchVault/context/vaultItem";
import { SENSITIVE_VALUE_PLACEHOLDER } from "~/constants/general";
import { getTransientCopyPreference } from "~/utils/preferences";
import useGetUpdatedVaultItem from "~/components/searchVault/utils/useGetUpdatedVaultItem";
import { captureException } from "~/utils/log";
import { showCopySuccessMessage } from "~/utils/clipboard";
import { getGenerator as getTotpGenerator } from "~/utils/authenticatorTotp";

type CopyTotpActionProps = {
  skipReprompt?: boolean;
  shortcut?: Keyboard.Shortcut | null;
};

function CopyTotpAction({ skipReprompt, shortcut }: CopyTotpActionProps) {
  const selectedItem = useSelectedVaultItem();
  const getUpdatedVaultItem = useGetUpdatedVaultItem();

  if (!selectedItem.login?.totp) return null;

  const copyTotp = async () => {
    const toast = await showToast(Toast.Style.Animated, "Getting TOTP code...");
    try {
      // The secret is already in the item; `bw get totp` would ask the server-side
      // premium check for a code the Authenticator command computes locally.
      const totpField = await getUpdatedVaultItem(selectedItem, (item) => item.login?.totp, "Getting code...");
      if (!totpField || totpField === SENSITIVE_VALUE_PLACEHOLDER) throw new Error("Failed to get TOTP code");
      const [generator, error] = getTotpGenerator(totpField);
      if (error) throw error;

      await toast?.hide();
      await Clipboard.copy(generator.generate(), { concealed: getTransientCopyPreference("other") });
      await showCopySuccessMessage("Copied code to clipboard");
    } catch (error) {
      toast.message = "Failed to get TOTP";
      toast.style = Toast.Style.Failure;
      captureException("Failed to copy TOTP", error);
    }
  };

  const actionProps: Omit<ActionWithRepromptProps, "repromptDescription"> = {
    title: "Copy TOTP",
    icon: Icon.Clipboard,
    onAction: copyTotp,
    shortcut:
      shortcut === null
        ? undefined
        : shortcut ?? { key: "t", modifiers: ["alt"] },
  };

  return skipReprompt ? (
    <Action {...actionProps} />
  ) : (
    <ActionWithReprompt {...actionProps} repromptDescription={`Copying the TOTP of <${selectedItem.name}>`} />
  );
}

export default CopyTotpAction;
