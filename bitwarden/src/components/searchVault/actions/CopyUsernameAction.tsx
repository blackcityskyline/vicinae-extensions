import { Action, Clipboard, Toast, showToast } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import { useSelectedVaultItem } from "~/components/searchVault/context/vaultItem";
import useGetUpdatedVaultItem from "~/components/searchVault/utils/useGetUpdatedVaultItem";
import { showCopySuccessMessage } from "~/utils/clipboard";
import { captureException } from "~/utils/log";
import { getTransientCopyPreference } from "~/utils/preferences";

function CopyUsernameAction() {
  const selectedItem = useSelectedVaultItem();
  const getUpdatedVaultItem = useGetUpdatedVaultItem();

  if (!selectedItem.login?.username) return null;

  const handleCopyUsername = async () => {
    try {
      const username = await getUpdatedVaultItem(selectedItem, (item) => item.login?.username, "Getting username...");
      if (username) {
        await Clipboard.copy(username, { concealed: getTransientCopyPreference("other") });
        await showCopySuccessMessage("Copied username to clipboard");
      }
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to get username");
      captureException("Failed to copy username", error);
    }
  };

  return (
    <Action
      title="Copy Username"
      icon={Icon.Person}
      onAction={handleCopyUsername}
      shortcut={{ key: "u", modifiers: ["alt"] }}
    />
  );
}

export default CopyUsernameAction;
