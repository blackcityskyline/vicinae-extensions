import { Action, Toast, open, showToast } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import { useSelectedVaultItem } from "~/components/searchVault/context/vaultItem";
import useGetUpdatedVaultItem from "~/components/searchVault/utils/useGetUpdatedVaultItem";
import { Item } from "~/types/vault";
import { captureException } from "~/utils/log";

function OpenUrlInBrowserAction() {
  const selectedItem = useSelectedVaultItem();
  const getUpdatedVaultItem = useGetUpdatedVaultItem();

  if (!getUri(selectedItem)) return null;

  const handleOpenUrlInBrowser = async () => {
    try {
      const mainUri = await getUpdatedVaultItem(selectedItem, getUri, "Getting URL...");
      if (mainUri) await open(mainUri);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to get URL");
      captureException("Failed to open URL in browser", error);
    }
  };

  return (
    <Action
      title="Open in Browser"
      onAction={handleOpenUrlInBrowser}
      icon={Icon.Globe}
      shortcut={{ key: "o", modifiers: ["alt"] }}
    />
  );
}

function getUri(item: Item) {
  return item.login?.uris?.[0]?.uri;
}

export default OpenUrlInBrowserAction;
