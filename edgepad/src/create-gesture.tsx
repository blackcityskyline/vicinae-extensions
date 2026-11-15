import { Action, ActionPanel, Icon, launchCommand, LaunchType, List, showToast, Toast } from "@vicinae/api";

import GestureForm from "./components/gesture-form";
import { useConfigs } from "./lib/use-configs";

async function openSettings(): Promise<void> {
  try {
    await launchCommand({ name: "settings", type: LaunchType.UserInitiated });
  } catch (error) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open settings", message: String(error) });
  }
}

/** Opens straight into the add-gesture form for the selected config. */
export default function CreateGesture() {
  const { selected, isLoading, error, reload } = useConfigs();

  if (isLoading) return <List isLoading searchBarPlaceholder="Loading edgepad configs" />;

  if (!selected) {
    return (
      <List searchBarPlaceholder="Add gesture">
        <List.EmptyView
          icon={Icon.Warning}
          title="No edgepad config found"
          description={error ?? "Point \"Config Directory\" at the folder that holds your edgepad .toml files."}
          actions={
            <ActionPanel>
              <Action title="Settings" icon={Icon.Cog} shortcut="open" onAction={() => void openSettings()} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void reload()} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return <GestureForm configPath={selected} />;
}
