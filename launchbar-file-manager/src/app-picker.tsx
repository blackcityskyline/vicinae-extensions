import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  getApplications,
  open,
  showToast,
  type Application,
} from "@vicinae/api";
import { usePromise } from "@raycast/utils";
import * as path from "node:path";

/**
 * Open With picker: the applications that claim this file's type, read from
 * the desktop entries Vicinae already indexes (`getApplications`). Enter opens
 * with the highlighted one; the default handler stays one action away.
 */
export function AppPicker(props: { filePath: string }) {
  const { filePath } = props;
  const fileName = path.basename(filePath);

  const { data, isLoading } = usePromise(
    async (target: string) => {
      try {
        return await getApplications(target);
      } catch (e) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Cannot list applications",
          message: e instanceof Error ? e.message : String(e),
        });
        return [];
      }
    },
    [filePath],
  );

  async function openWith(appName: string, appPath: string) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Opening ${fileName}…`,
      message: `with ${appName}`,
    });
    try {
      await open(filePath, appPath);
      toast.style = Toast.Style.Success;
      toast.title = "Opened";
      toast.message = `${fileName} → ${appName}`;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Open failed";
      toast.message = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Open With → ${fileName}`}
      searchBarPlaceholder={`Open ${fileName} with… (type to find)`}
    >
      {(data ?? [])
        .filter((app): app is Application & { path: string } => !!app.path)
        .map((app) => (
          <List.Item
            key={app.id}
            title={app.name}
            subtitle={path.basename(app.path)}
            icon={app.icon ? { source: app.icon } : Icon.AppWindow}
            keywords={[app.name, path.basename(app.path, ".desktop")]}
            actions={
              <ActionPanel>
                <Action
                  title="Open with This App"
                  icon={Icon.ArrowRight}
                  shortcut="open"
                  onAction={() => openWith(app.name, app.path)}
                />
                <Action
                  title="Open with the Default App"
                  icon={Icon.AppWindow}
                  onAction={() => open(filePath)}
                />
              </ActionPanel>
            }
          />
        ))}
      {!isLoading && (data ?? []).length === 0 ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No applications handle this file"
          description="Nothing on this system claims its type; open it with the default handler instead"
          actions={
            <ActionPanel>
              <Action
                title="Open with the Default App"
                icon={Icon.AppWindow}
                onAction={() => open(filePath)}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
