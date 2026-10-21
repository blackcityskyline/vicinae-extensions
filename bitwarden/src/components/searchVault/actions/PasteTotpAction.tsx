import { Action, Clipboard, Keyboard, showToast, Toast } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import ActionWithReprompt, { ActionWithRepromptProps } from "~/components/actions/ActionWithReprompt";
import { useSelectedVaultItem } from "~/components/searchVault/context/vaultItem";
import { SENSITIVE_VALUE_PLACEHOLDER } from "~/constants/general";
import { getGenerator as getTotpGenerator } from "~/utils/authenticatorTotp";
import useGetUpdatedVaultItem from "~/components/searchVault/utils/useGetUpdatedVaultItem";
import { captureException } from "~/utils/log";
import useFrontmostApplicationName from "~/utils/hooks/useFrontmostApplicationName";

type PasteTotpActionProps = {
  skipReprompt?: boolean;
  shortcut?: Keyboard.Shortcut | null;
};

function PasteTotpAction({ skipReprompt, shortcut }: PasteTotpActionProps) {
  const selectedItem = useSelectedVaultItem();
  const getUpdatedVaultItem = useGetUpdatedVaultItem();
  const currentApplicationName = useFrontmostApplicationName();

  if (!selectedItem.login?.totp) return null;

  const pasteTotp = async () => {
    const toast = await showToast(Toast.Style.Animated, "Getting TOTP code...");
    try {
      // The secret is already in the item; `bw get totp` would ask the server-side
      // premium check for a code the Authenticator command computes locally.
      const totpField = await getUpdatedVaultItem(selectedItem, (item) => item.login?.totp, "Getting code...");
      if (!totpField || totpField === SENSITIVE_VALUE_PLACEHOLDER) throw new Error("Failed to get TOTP code");
      const [generator, error] = getTotpGenerator(totpField);
      if (error) throw error;

      await toast?.hide();
      await Clipboard.paste(generator.generate());
    } catch (error) {
      toast.message = "Failed to get TOTP";
      toast.style = Toast.Style.Failure;
      captureException("Failed to paste TOTP", error);
    }
  };

  const actionProps: Omit<ActionWithRepromptProps, "repromptDescription"> = {
    title: currentApplicationName ? `Paste TOTP into ${currentApplicationName}` : "Paste TOTP",
    icon: Icon.Window,
    onAction: pasteTotp,
    shortcut:
      shortcut === null
        ? undefined
        : shortcut ?? { key: "t", modifiers: ["alt", "shift"] },
  };

  return skipReprompt ? (
    <Action {...actionProps} />
  ) : (
    <ActionWithReprompt {...actionProps} repromptDescription={`Pasting the TOTP of <${selectedItem.name}>`} />
  );
}

export default PasteTotpAction;
