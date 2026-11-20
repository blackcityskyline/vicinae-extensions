import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  WindowManagement,
} from '@vicinae/api';
import { useEffect, useMemo, useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprClient } from './types';
import { dispatchWindowCommand, focusHyprTarget } from './utils/dispatch';
import { formatWorkspace } from './utils/format';
import {
  centerWindowCommand,
  closeWindowCommand,
  floatWindowCommand,
  fullscreenWindowCommand,
  moveWindowToWorkspaceCommand,
  pinWindowCommand,
} from './utils/lua';

type NativeWindow = Awaited<
  ReturnType<typeof WindowManagement.getWindows>
>[number];

/** Hyprland's default binds cover ten workspaces; a window can be sent to any. */
const WORKSPACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function Windows() {
  const [clients, isLoading, refresh] = useHyprctlData<HyprClient[]>(
    'clients',
    [],
    'Failed to load windows'
  );
  const [nativeWindows, setNativeWindows] = useState<NativeWindow[]>([]);
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadNativeWindows = async () => {
      try {
        const windows = await WindowManagement.getWindows();

        if (!cancelled) {
          setNativeWindows(windows);
        }
      } catch (error) {
        console.warn('Failed to load native window metadata:', error);
      }
    };

    void loadNativeWindows();

    return () => {
      cancelled = true;
    };
  }, []);

  const nativeWindowsById = useMemo(
    () => new Map(nativeWindows.map((window) => [window.id, window])),
    [nativeWindows]
  );
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) => {
        if (a.focusHistoryID === 0) return -1;
        if (b.focusHistoryID === 0) return 1;

        return a.workspace.id - b.workspace.id;
      }),
    [clients]
  );

  /** Runs a dispatcher and re-reads the list, so the row shows the new state. */
  const runWindowCommand = async (command: string) => {
    if (await dispatchWindowCommand(command)) {
      await refresh();
    }
  };

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search clients..."
    >
      {sortedClients.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Clients Found"
          description="No Hyprland clients were returned by hyprctl."
        />
      ) : (
        <List.Section
          title="Windows"
          subtitle={sortedClients.length.toString()}
        >
          {sortedClients.map((client) => {
            const workspace = formatWorkspace(
              client.workspace.id,
              client.workspace.name
            );
            const nativeWindow = nativeWindowsById.get(client.address);

            return (
              <List.Item
                key={client.address}
                title={client.title || client.class || client.address}
                subtitle={
                  isShowingDetail
                    ? undefined
                    : (nativeWindow?.application?.name ?? client.class)
                }
                icon={nativeWindow?.application?.icon ?? Icon.AppWindow}
                keywords={[
                  client.title,
                  client.class,
                  client.initialTitle,
                  client.initialClass,
                  workspace,
                  client.pid.toString(),
                ]}
                accessories={
                  isShowingDetail
                    ? []
                    : [
                        ...(client.floating
                          ? [
                              {
                                tag: { value: 'Floating', color: Color.Green },
                                icon: Icon.FloatingWindow,
                              },
                            ]
                          : []),
                        ...(client.focusHistoryID === 0
                          ? [
                              {
                                tag: { value: 'Current', color: Color.Blue },
                              },
                            ]
                          : []),
                        ...(client.fullscreen
                          ? [
                              {
                                tag: {
                                  value: 'Fullscreen',
                                  color: Color.Purple,
                                },
                                icon: Icon.Fullscreen,
                              },
                            ]
                          : []),
                        { tag: `WS ${workspace}` },
                      ]
                }
                actions={
                  <ActionPanel>
                    <Action
                      title="Focus Window"
                      shortcut={{ modifiers: ['ctrl'], key: 'return' }}
                      icon={Icon.Eye}
                      onAction={() => focusHyprTarget('window', client.address)}
                    />
                    <Action
                      title="Close Window"
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'q' }}
                      icon={Icon.Xmark}
                      onAction={() =>
                        runWindowCommand(closeWindowCommand(client.address))
                      }
                    />
                    <ActionPanel.Section title="Manage">
                      <Action
                        title={
                          client.floating ? 'Tile Window' : 'Float Window'
                        }
                        shortcut={{ modifiers: ['ctrl', 'shift'], key: 'f' }}
                        icon={Icon.FloatingWindow}
                        onAction={() =>
                          runWindowCommand(floatWindowCommand(client.address))
                        }
                      />
                      <Action
                        title={
                          client.pinned ? 'Unpin Window' : 'Pin Window'
                        }
                        shortcut={{ modifiers: ['ctrl', 'shift'], key: 'p' }}
                        icon={client.pinned ? Icon.PinDisabled : Icon.Pin}
                        onAction={() =>
                          runWindowCommand(pinWindowCommand(client.address))
                        }
                      />
                      <Action
                        title={
                          client.fullscreen
                            ? 'Leave Fullscreen'
                            : 'Fullscreen Window'
                        }
                        shortcut={{ modifiers: ['ctrl', 'shift'], key: 'm' }}
                        icon={Icon.Fullscreen}
                        onAction={() =>
                          runWindowCommand(
                            fullscreenWindowCommand(client.address)
                          )
                        }
                      />
                      <Action
                        title="Center Window"
                        shortcut={{ modifiers: ['ctrl', 'shift'], key: 'c' }}
                        icon={Icon.Center}
                        onAction={() =>
                          runWindowCommand(centerWindowCommand(client.address))
                        }
                      />
                      <ActionPanel.Submenu
                        title="Move to Workspace"
                        shortcut={{ modifiers: ['ctrl', 'shift'], key: 'w' }}
                        icon={Icon.Move}
                      >
                        {WORKSPACES.map((workspace) => (
                          <Action
                            key={workspace}
                            title={`Workspace ${workspace}`}
                            onAction={() =>
                              runWindowCommand(
                                moveWindowToWorkspaceCommand(
                                  client.address,
                                  workspace
                                )
                              )
                            }
                          />
                        ))}
                      </ActionPanel.Submenu>
                    </ActionPanel.Section>
                    <Action
                      title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                      icon={Icon.AppWindowSidebarRight}
                      shortcut={{ modifiers: ['cmd'], key: 'd' }}
                      onAction={() => setIsShowingDetail((visible) => !visible)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Title"
                      shortcut={Keyboard.Shortcut.Common.Copy}
                      content={client.title}
                    />
                    <Action.CopyToClipboard
                      title="Copy Class"
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'k' }}
                      content={client.class}
                    />
                    <Action.CopyToClipboard
                      title="Copy Address"
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'a' }}
                      content={client.address}
                    />
                    <Action.CopyToClipboard
                      title="Copy PID"
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'i' }}
                      content={client.pid.toString()}
                    />
                    <Action.CopyToClipboard
                      title="Copy JSON"
                      shortcut={{ modifiers: ['ctrl', 'shift'], key: 'j' }}
                      content={JSON.stringify(client, null, 2)}
                    />
                  </ActionPanel>
                }
                detail={
                  <List.Item.Detail
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Title"
                          text={client.title || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Application"
                          text={nativeWindow?.application?.name ?? client.class}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Class"
                          text={client.class || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Workspace"
                          text={workspace}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Monitor ID"
                          text={client.monitor.toString()}
                        />
                        <List.Item.Detail.Metadata.TagList title="State">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={client.floating ? 'Floating' : 'Tiled'}
                            color={client.floating ? Color.Green : undefined}
                          />
                          {client.focusHistoryID === 0 ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Current"
                              color={Color.Blue}
                            />
                          ) : null}
                          {client.fullscreen ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text={
                                client.fullscreen === 1
                                  ? 'Maximized'
                                  : 'Fullscreen'
                              }
                              color={Color.Purple}
                            />
                          ) : null}
                          {client.pinned ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Pinned"
                              color={Color.Orange}
                            />
                          ) : null}
                          {client.hidden ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Hidden"
                              color={Color.SecondaryText}
                            />
                          ) : null}
                          {client.inhibitingIdle ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="Inhibiting Idle"
                              color={Color.Yellow}
                            />
                          ) : null}
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.TagList title="Protocol">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={client.xwayland ? 'XWayland' : 'Wayland'}
                          />
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.Label
                          title="Size"
                          text={`${client.size[0]} × ${client.size[1]}`}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Position (X, Y)"
                          text={`${client.at[0]}, ${client.at[1]}`}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="PID"
                          text={client.pid.toString()}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Address"
                          text={client.address}
                        />
                        {client.tags.length > 0 ? (
                          <List.Item.Detail.Metadata.TagList title="Tags">
                            {client.tags.map((tag) => (
                              <List.Item.Detail.Metadata.TagList.Item
                                key={tag}
                                text={tag}
                              />
                            ))}
                          </List.Item.Detail.Metadata.TagList>
                        ) : null}
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
