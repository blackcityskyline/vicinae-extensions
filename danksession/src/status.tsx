import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, confirmAlert, showToast, type KeyEquivalent } from "@vicinae/api";
import { homedir } from "node:os";
import { join } from "node:path";
import { useCallback, useEffect, useState } from "react";

import {
  type ServiceAction,
  capture,
  manageService,
  previewRestore,
  readService,
  readStatus,
  restore,
} from "~/api/danksession.ts";
import {
  type RestorePlan,
  type ServiceState,
  type Snapshot,
  formatAge,
  restoreLabel,
  restoreSummary,
} from "~/utils/state.ts";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SERVICE_ACTIONS: Record<ServiceAction, { pending: string; done: string; failed: string }> = {
  start: { pending: "Starting the service", done: "Service started", failed: "Could not start the service" },
  stop: { pending: "Stopping the service", done: "Service stopped", failed: "Could not stop the service" },
  restart: { pending: "Restarting the service", done: "Service restarted", failed: "Could not restart the service" },
  enable: {
    pending: "Enabling the service at login",
    done: "Service enabled at login",
    failed: "Could not enable the service",
  },
  disable: {
    pending: "Disabling the service at login",
    done: "Service disabled at login",
    failed: "Could not disable the service",
  },
  "enable-and-start": {
    pending: "Enabling and starting the service",
    done: "Service enabled and started",
    failed: "Could not enable and start the service",
  },
};

const key = (letter: string): Keyboard.Shortcut => ({ modifiers: ["ctrl", "shift"], key: letter as KeyEquivalent });

function ServiceActions({ service, refresh }: { service: ServiceState | null; refresh: () => Promise<void> }) {
  const perform = useCallback(
    async (action: ServiceAction) => {
      const spec = SERVICE_ACTIONS[action];
      const toast = await showToast({ style: Toast.Style.Animated, title: spec.pending });
      try {
        await manageService(action);
        // The unit is active before the daemon has answered its first status call.
        if (action === "start" || action === "restart" || action === "enable-and-start") {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        toast.style = Toast.Style.Success;
        toast.title = spec.done;
      } catch (cause) {
        toast.style = Toast.Style.Failure;
        toast.title = spec.failed;
        toast.message = errorText(cause);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  if (!service) return null;

  if (!service.loaded) {
    return (
      <ActionPanel.Section title="Service">
        <Action.ShowInFinder
          title="Open systemd User Folder"
          path={join(homedir(), ".config", "systemd", "user")}
          icon={Icon.Folder}
          shortcut={key("f")}
        />
      </ActionPanel.Section>
    );
  }

  return (
    <ActionPanel.Section title="Service">
      {service.active ? (
        <>
          <Action
            title="Restart Service"
            icon={Icon.ArrowClockwise}
            shortcut={key("r")}
            onAction={() => void perform("restart")}
          />
          <Action title="Stop Service" icon={Icon.Stop} shortcut={key("x")} onAction={() => void perform("stop")} />
          {service.enabled ? (
            <Action
              title="Disable at Login"
              icon={Icon.XMarkCircle}
              shortcut={key("d")}
              onAction={() => void perform("disable")}
            />
          ) : (
            <Action
              title="Enable at Login"
              icon={Icon.CheckCircle}
              shortcut={key("l")}
              onAction={() => void perform("enable")}
            />
          )}
        </>
      ) : service.enabled ? (
        <Action title="Start Service" icon={Icon.Play} shortcut={key("p")} onAction={() => void perform("start")} />
      ) : (
        <>
          <Action
            title="Enable and Start Service"
            icon={Icon.Play}
            shortcut={key("p")}
            onAction={() => void perform("enable-and-start")}
          />
          <Action title="Start Once" icon={Icon.Bolt} shortcut={key("o")} onAction={() => void perform("start")} />
        </>
      )}
    </ActionPanel.Section>
  );
}

function LayoutActions({ refresh, service }: { refresh: () => Promise<void>; service: ServiceState | null }) {
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
      <ServiceActions service={service} refresh={refresh} />
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
    </ActionPanel>
  );
}

export default function WindowLayoutCommand() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [service, setService] = useState<ServiceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await readStatus());
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
    setService(await readService());
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
              <ServiceActions service={service} refresh={refresh} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const age = formatAge(snapshot.savedAt);
  const daemonDetail = snapshot.daemonRunning
    ? "danksession daemon is capturing events"
    : service === null
      ? "Not running — systemd is not reachable from here."
      : !service.loaded
        ? "Not running — no danksession.service in the systemd user folder."
        : !service.enabled
          ? "Not running — the service is not enabled at login."
          : "Not running — the service is enabled but stopped.";

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
          actions={<LayoutActions refresh={refresh} service={service} />}
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
              actions={<LayoutActions refresh={refresh} service={service} />}
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
          subtitle={daemonDetail}
          icon={snapshot.daemonRunning ? Icon.Clock : Icon.CircleDisabled}
          accessories={
            service?.loaded
              ? [
                  {
                    tag: {
                      value: service.enabled ? "enabled at login" : "login start off",
                      color: service.enabled ? Color.Green : Color.SecondaryText,
                    },
                  },
                ]
              : []
          }
          actions={
            <ActionPanel>
              <ServiceActions service={service} refresh={refresh} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={() => void refresh()} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
