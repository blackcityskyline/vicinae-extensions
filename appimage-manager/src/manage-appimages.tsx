import {
  Action,
  ActionPanel,
  Alert,
  Icon,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  environment,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { cliPath, describeSource, listApps, runApp, uninstallApp, updateApps, type AppImageApp } from "./appimage";
import { InstallForm } from "./components/InstallForm";
import { SettingsForm } from "./components/SettingsForm";

const script = cliPath(environment.assetsPath);

export default function ManageAppImages() {
  const [apps, setApps] = useState<AppImageApp[]>();
  const [error, setError] = useState<string>();
  const { push } = useNavigation();

  const load = useCallback(() => {
    listApps(script)
      .then((next) => {
        setApps(next);
        setError(undefined);
      })
      .catch((cause: Error) => {
        setApps([]);
        setError(cause.message);
      });
  }, []);

  useEffect(load, [load]);

  const open = useCallback(async (app: AppImageApp) => {
    try {
      await runApp(script, app.id);
      await closeMainWindow();
    } catch (cause) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Could not start ${app.name}`,
        message: (cause as Error).message,
      });
    }
  }, []);

  const uninstall = useCallback(
    async (app: AppImageApp) => {
      const confirmed = await confirmAlert({
        title: `Uninstall ${app.name}?`,
        message: app.external
          ? `Its file ${app.exec} is deleted. It was added by another launcher, so nothing else belongs to it.`
          : "The AppImage, its launcher entry and its icon are deleted.",
        primaryAction: { title: "Uninstall", style: Alert.ActionStyle.Destructive },
      });
      if (!confirmed) return;
      const outcome = await uninstallApp(script, app.id);
      if (!outcome.ok) {
        await showToast({ style: Toast.Style.Failure, title: "Could not uninstall", message: outcome.error });
        return;
      }
      await showToast({ style: Toast.Style.Success, title: "Uninstalled", message: app.name });
      load();
    },
    [load],
  );

  const update = useCallback(
    async (app: AppImageApp) => {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Updating", message: app.name });
      try {
        await updateApps(script, app.id);
        toast.hide();
        await showToast({ style: Toast.Style.Success, title: "Updated", message: app.name });
      } catch (cause) {
        toast.hide();
        await showToast({ style: Toast.Style.Failure, title: "Could not update", message: (cause as Error).message });
      }
      load();
    },
    [load],
  );

  return (
    <List isLoading={apps === undefined} searchBarPlaceholder="Search AppImages" navigationTitle="AppImages">
      {apps?.map((app) => (
        <List.Item
          key={app.id}
          icon={app.icon || Icon.AppWindow}
          title={app.name}
          subtitle={`${app.version || "unknown version"} · ${describeSource(app)}`}
          accessories={app.external ? [{ tag: "External" }] : undefined}
          actions={
            <ActionPanel>
              <Action title="Open" icon={Icon.Play} shortcut="open" onAction={() => open(app)} />
              {app.sourceKind === "github" ? (
                <Action
                  title="Update to the Latest Release"
                  icon={Icon.Download}
                  shortcut={{ modifiers: ["ctrl"], key: "u" }}
                  onAction={() => update(app)}
                />
              ) : null}
              <Action
                title="App Settings"
                icon={Icon.Cog}
                shortcut={{ modifiers: ["ctrl"], key: "e" }}
                onAction={() => push(<SettingsForm id={app.id} name={app.name} onSaved={load} />)}
              />
              <Action
                title="Uninstall"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "d" }}
                onAction={() => uninstall(app)}
              />
              <ActionPanel.Section>
                <Action
                  title="Install AppImage…"
                  icon={Icon.Plus}
                  shortcut="new"
                  onAction={() => push(<InstallForm onDone={load} />)}
                />
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
      <List.EmptyView
        icon={Icon.Download}
        title={error ? "The AppImage manager is not available" : "No AppImages installed"}
        description={
          error ?? "Install one from a file, a download URL or a GitHub release. Apps another launcher added are picked up here too."
        }
        actions={
          <ActionPanel>
            <Action
              title="Install AppImage…"
              icon={Icon.Plus}
              shortcut="new"
              onAction={() => push(<InstallForm onDone={load} />)}
            />
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={load} />
          </ActionPanel>
        }
      />
    </List>
  );
}
