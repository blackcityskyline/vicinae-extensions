import { List, ActionPanel, Action, Icon, showToast, Toast, confirmAlert, Alert, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { listWebapps, removeWebapp } from "~/api/webapp";
import EditWebapp from "~/edit";

export default function ManageCommand() {
  const { push } = useNavigation();
  const [apps, setApps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const list = await listWebapps();
      setApps(list);
    } catch (e) {
      await showToast(Toast.Style.Failure, String(e));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRemove(name: string) {
    const options: Alert.Options = {
      title: "Remove web app",
      message: 'Remove "' + name + '" and its icon?',
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
    };
    if (await confirmAlert(options)) {
      try {
        const result = await removeWebapp(name);
        if (result.ok) {
          await showToast(Toast.Style.Success, result.message);
          await load();
        } else {
          await showToast(Toast.Style.Failure, result.message);
        }
      } catch (e) {
        await showToast(Toast.Style.Failure, String(e));
      }
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search web apps">
      {apps.map((name) => (
        <List.Item
          key={name}
          title={name}
          icon={Icon.Globe01}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Edit"
                  icon={Icon.Pencil}
                  shortcut="edit"
                  onAction={() => push(<EditWebapp name={name} />)}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Remove"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut="remove"
                  onAction={() => handleRemove(name)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
      <List.EmptyView title="No web apps" description="Use Create Webapp to create one." />
    </List>
  );
}
