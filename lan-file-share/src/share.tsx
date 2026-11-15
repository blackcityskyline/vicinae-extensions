import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  Toast,
  confirmAlert,
  open,
  openExtensionPreferences,
  showToast,
} from "@vicinae/api";
import { promises as fs } from "node:fs";
import path from "node:path";
import { useCallback, useEffect, useState } from "react";
import { savePanelState, syncServiceConfig } from "~/api/config";
import { addShareEntry } from "~/api/list";
import { qrImageUrl, writeQrCode } from "~/api/qr";
import {
  checkDataPlane,
  conflictMessage,
  probe,
  restartService,
  startService,
  stopService,
} from "~/api/service";
import { loadSnapshot, type Snapshot } from "~/api/snapshot";
import { showFailure } from "~/api/toast";
import { AddItemsForm } from "~/components/add-items-form";
import { strings } from "~/utils/strings";
import type { ActionResult, ProbeResult, ServiceStatus } from "~/utils/types";

/**
 * The panel stays minimal: one row with the session state, and the address above the QR code next to it. The
 * network interface sits in the search bar, and the share list itself is managed on the page.
 */
export default function Command() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await loadSnapshot();
      if (next.probe.state === "running") {
        // The service serves this file at /qr.png, so the panel needs no local-file image support.
        await writeQrCode(next.probe.status.address).catch(() => undefined);
      }
      setSnapshot(next);
    } catch (error) {
      await showFailure(strings.statusUnknown, error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (title: string, action: () => Promise<ActionResult>, verifyDataPlane = false) => {
      setIsBusy(true);
      try {
        const result = await action();
        if (!result.ok) {
          await showFailure(title, result.message);
          return;
        }
        if (verifyDataPlane) {
          const current = await probe();
          if (current.state === "running" && !(await checkDataPlane(current.status))) {
            await showFailure(strings.unreachableAfterStart, current.status.address);
            return;
          }
        }
        await showToast({ style: Toast.Style.Success, title, message: result.message });
      } finally {
        setIsBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const startSharing = useCallback(async () => {
    if (!snapshot) return;
    if (snapshot.interfaces.length === 0) {
      await showFailure(strings.statusNoInterface, strings.noInterfaceDetail);
      return;
    }
    await run(strings.start, () => startService(snapshot.config), true);
  }, [run, snapshot]);

  const stopSharing = useCallback(() => run(strings.stop, () => stopService()), [run]);

  const restartSharing = useCallback(
    () => (snapshot ? run(strings.restart, () => restartService(snapshot.config), true) : undefined),
    [run, snapshot],
  );

  const useInterface = useCallback(
    async (host: string) => {
      if (!snapshot || host === snapshot.selectedHost) return;
      const item = snapshot.interfaces.find((entry) => entry.address === host);
      await savePanelState({ host });

      const applyOnNextStart = async () => {
        await showToast({ style: Toast.Style.Success, title: strings.interfaceWillApplyOnStart(host) });
        await refresh();
      };

      if (snapshot.probe.state !== "running") {
        await applyOnNextStart();
        return;
      }

      const confirmed = await confirmAlert({
        title: strings.switchInterfaceTitle(item?.name ?? host, host),
        message: strings.switchInterfaceMessage,
        primaryAction: { title: strings.restart },
        dismissAction: { title: strings.later },
      });
      if (!confirmed) {
        await applyOnNextStart();
        return;
      }
      const config = await syncServiceConfig({ preferences: snapshot.preferences, host });
      await run(strings.restart, () => restartService(config), true);
    },
    [refresh, run, snapshot],
  );

  /** Adds paths to the list. They are referenced in place: nothing is copied to the receive directory. */
  const addPaths = useCallback(
    async (paths: string[]) => {
      try {
        for (const target of paths) {
          const stat = await fs.stat(target);
          await addShareEntry({
            type: stat.isDirectory() ? "directory" : "file",
            name: path.basename(target),
            path: target,
          });
        }
        await showToast({
          style: Toast.Style.Success,
          title: strings.added(paths.length),
          message: strings.referencedInPlace,
        });
      } catch (error) {
        await showFailure(strings.addFailed, error);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const openReceiveDirectory = useCallback(async () => {
    if (!snapshot) return;
    const directory = snapshot.preferences.receiveDirectory;
    try {
      await fs.mkdir(directory, { recursive: true });
      await open(directory);
    } catch (error) {
      await showFailure(strings.openReceiveDirectory, error);
    }
  }, [snapshot]);

  const probeResult: ProbeResult = snapshot?.probe ?? { state: "unknown", message: "Loading" };
  const status: ServiceStatus | undefined = probeResult.state === "running" ? probeResult.status : undefined;
  const predictedAddress =
    snapshot && snapshot.selectedHost ? `http://${snapshot.selectedHost}:${snapshot.config.port}/` : "";
  const address = status?.address ?? predictedAddress;

  return (
    <List
      isLoading={isLoading || isBusy}
      isShowingDetail
      searchBarPlaceholder={strings.fileShare}
      searchBarAccessory={
        snapshot && snapshot.interfaces.length > 0 ? (
          <List.Dropdown
            tooltip={strings.interfaceDropdown}
            value={snapshot.selectedHost}
            onChange={(host) => void useInterface(host)}
          >
            {snapshot.interfaces.map((item) => (
              <List.Dropdown.Item
                key={`${item.name}-${item.address}`}
                title={`${item.name} · ${item.address}`}
                value={item.address}
                icon={Icon.Network}
              />
            ))}
          </List.Dropdown>
        ) : null
      }
    >
      <List.Item
        id="session"
        title={headline(probeResult)}
        icon={statusIcon(probeResult)}
        detail={<List.Item.Detail markdown={detailMarkdown(snapshot, probeResult)} />}
        actions={
          <ActionPanel>
            {status ? (
              <Action
                title={strings.stop}
                icon={Icon.Stop}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                onAction={() => void stopSharing()}
              />
            ) : (
              <Action
                title={strings.start}
                icon={Icon.Play}
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={() => void startSharing()}
              />
            )}
            <Action.Push
              title={strings.addItems}
              icon={Icon.Plus}
              shortcut="new"
              target={<AddItemsForm onAdd={addPaths} />}
            />
            {address !== "" ? (
              <Action.CopyToClipboard title={strings.copyAddress} content={address} shortcut="copy" />
            ) : null}
            {address !== "" ? (
              <Action.OpenInBrowser title={strings.openInBrowser} url={address} shortcut="open" />
            ) : null}
            {status ? (
              <Action
                title={strings.restart}
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
                onAction={() => void restartSharing()}
              />
            ) : null}
            <Action
              title={strings.openReceiveDirectory}
              icon={Icon.Download}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
              onAction={() => void openReceiveDirectory()}
            />
            <Action
              title={strings.refresh}
              icon={Icon.ArrowClockwise}
              shortcut="refresh"
              onAction={() => void refresh()}
            />
            <Action
              title={strings.openPreferences}
              icon={Icon.Cog}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}

function headline(probeResult: ProbeResult): string {
  if (probeResult.state === "running") return strings.statusRunning;
  if (probeResult.state === "conflict") return strings.statusConflict;
  if (probeResult.state === "unknown") return strings.statusUnknown;
  return strings.statusStopped;
}

function statusIcon(probeResult: ProbeResult): { source: Icon; tintColor: Color } {
  if (probeResult.state === "running") return { source: Icon.Play, tintColor: Color.Green };
  if (probeResult.state === "conflict" || probeResult.state === "unknown") {
    return { source: Icon.Warning, tintColor: Color.Orange };
  }
  return { source: Icon.Power, tintColor: Color.SecondaryText };
}

/** `raycast-width` is how Vicinae's markdown renderer is told how wide an image should be. */
function detailMarkdown(snapshot: Snapshot | undefined, probeResult: ProbeResult): string {
  if (!snapshot) return "";

  const status = probeResult.state === "running" ? probeResult.status : undefined;
  if (!status) {
    const lines = [strings.startHint];
    if (probeResult.state === "conflict") lines.unshift(conflictMessage(probeResult.port, probeResult.owner));
    else if (probeResult.state === "unknown") lines.unshift(probeResult.message);
    else if (snapshot.interfaces.length === 0) lines.unshift(strings.noInterfaceDetail);
    return lines.join("\n\n");
  }

  const lines = [
    `**${strings.shareLink}**`,
    "",
    status.address,
    "",
    `**${strings.qrCode}**`,
    "",
    `![QR code for ${status.address}](${qrImageUrl(status.address)}?raycast-width=220)`,
  ];
  if (snapshot.preferences.portProblem) lines.push("", `> ${snapshot.preferences.portProblem}`);
  else if (status.port !== snapshot.config.port || status.host !== snapshot.selectedHost) {
    lines.push("", `> ${strings.restartNeededDetail}`);
  }
  lines.push("", `> ${strings.firewallHint(status.port)}`);
  return lines.join("\n");
}
