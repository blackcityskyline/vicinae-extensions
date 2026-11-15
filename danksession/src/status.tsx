import { Action, ActionPanel, Color, Icon, List, Toast, confirmAlert, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { capture, previewRestore, readStatus, restore } from "~/api/danksession.ts";
import { type RestorePlan, type Snapshot, formatAge, restoreLabel, restoreSummary } from "~/utils/state.ts";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function LayoutActions({ refresh }: { refresh: () => Promise<void> }) {
  const perform = useCallback(
    async (title: string, action: () => Promise<string>) => {
      const toast = await showToast({ style: Toast.Style.Animated, title });
      try {
        const message = await action();
        toast.style = Toast.Style.Success;
        toast.title = message;
      } catch (cause) {
        toast.style = Toast.Style.Failure;
        toast.title = `${title} failed`;
        toast.message = errorText(cause);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const save = useCallback(
    () => perform("Saving the layout", async () => `${await capture()} windows saved`),
    [perform],
  );

  const preview = useCallback(async () => {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Previewing the restore" });
    try {
      const plan: RestorePlan = await previewRestore();
      toast.style = Toast.Style.Success;
      toast.title = restoreSummary(plan);
      toast.message = plan.operations.length
        ? plan.operations
            .slice(0, 4)
            .map((operation) => `${operation.kind}: ${operation.detail}`)
            .join("\n")
        : "Nothing would move.";
    } catch (cause) {
      toast.style = Toast.Style.Failure;
      toast.title = "The preview failed";
      toast.message = errorText(cause);
    }
  }, []);

  const restoreLayout = useCallback(async () => {
    const confirmed = await confirmAlert({
      title: "Restore the saved layout?",
      message: "Windows currently open are moved to their saved workspace and size. Applications with a launch rule are started if they are missing.",
      primaryAction: { title: "Restore" },
    });
    if (!confirmed) return;
    await perform("Restoring the layout", async () => `Restored: ${restoreSummary(await restore())}`);
  }, [perform]);

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action title="Save Now" icon={Icon.SaveDocument} shortcut="save" onAction={() => void save()} />
        <Action title="Preview Restore" icon={Icon.Eye} shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }} onAction={() => void preview()} />
        <Action title="Restore Layout" icon={Icon.Undo} shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }} onAction={() => void restoreLayout()} />
      </ActionPanel.Section>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
    </ActionPanel>
  );
}

export default function WindowLayoutCommand() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await readStatus());
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!snapshot) {
    return (
      <List isLoading={!error} navigationTitle="DankSession">
        <List.Item
          title={error ? "Cannot read the danksession state" : "Reading the saved layout…"}
          subtitle={error ?? undefined}
          icon={error ? Icon.Warning : Icon.CircleProgress}
          actions={
            <ActionPanel>
              <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const age = formatAge(snapshot.savedAt);

  return (
    <List navigationTitle="DankSession" searchBarPlaceholder="Filter saved windows">
      <List.Section title="Snapshot">
        <List.Item
          title={snapshot.saved ? `Saved ${age}` : "Nothing saved yet"}
          subtitle={
            snapshot.saved
              ? `${snapshot.windows} windows · ${snapshot.workspaces} workspaces · auto capture every ${snapshot.captureIntervalSeconds} s`
              : "Save now writes the open windows to the state file."
          }
          icon={snapshot.saved ? Icon.Desktop : Icon.CircleDisabled}
          accessories={[
            { tag: { value: snapshot.daemonRunning ? "daemon running" : "daemon stopped", color: snapshot.daemonRunning ? Color.Green : Color.SecondaryText } },
            ...(snapshot.autoRestore ? [{ tag: { value: "auto restore", color: Color.Blue } }] : []),
          ]}
          keywords={[age, snapshot.statePath]}
          actions={<LayoutActions refresh={refresh} />}
        />
      </List.Section>

      {snapshot.savedWindows.length > 0 ? (
        <List.Section title="Saved windows">
          {snapshot.savedWindows.map((window, index) => (
            <List.Item
              key={`${window.application}-${window.workspace.id}-${index}`}
              title={window.application}
              subtitle={`Workspace ${window.workspace.name} · ${window.width}×${window.height}`}
              icon={Icon.AppWindow}
              accessories={[
                {
                  tag: {
                    value: restoreLabel(window.restore),
                    color: window.restore === "relaunch" ? Color.Blue : Color.SecondaryText,
                  },
                },
              ]}
              keywords={[window.workspace.name, window.restore]}
              actions={<LayoutActions refresh={refresh} />}
            />
          ))}
        </List.Section>
      ) : null}

      <List.Section title="Backend">
        <List.Item
          title="State file"
          subtitle={snapshot.statePath}
          icon={Icon.HardDrive}
          accessories={[{ tag: { value: snapshot.autoCapture ? "auto capture on" : "auto capture off", color: snapshot.autoCapture ? Color.Green : Color.SecondaryText } }]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy State Path" content={snapshot.statePath} shortcut="copy-path" />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Daemon"
          subtitle={snapshot.daemonRunning ? "danksession daemon is capturing events" : "Not running — start danksession.service to capture automatically"}
          icon={snapshot.daemonRunning ? Icon.Clock : Icon.CircleDisabled}
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
