import { Action, ActionPanel, Cache, Grid, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  executePlaybackAction,
  formatTime,
  getAllPlayers,
  playerSubtitle,
  type PlayerCtlPlaybackAction,
  type PlayerInfo,
  type PlayerStatus,
} from "./utils/playerctl";
import { getPreferredPlayerNames } from "./utils/preferences";

type ViewMode = "grid" | "side-panel";

const cache = new Cache({ namespace: "view" });
const VIEW_KEY = "mode";

function statusIcon(status: PlayerStatus) {
  if (status === "Playing") return Icon.Play;
  if (status === "Paused") return Icon.Pause;
  return Icon.Stop;
}

function coverArt(player: PlayerInfo) {
  return player.metadata?.albumArt || statusIcon(player.status);
}

interface PlayerActionsProps {
  player: PlayerInfo;
  onAction: (player: PlayerInfo, action: PlayerCtlPlaybackAction) => void;
  onToggleView: () => void;
  view: ViewMode;
}

function PlayerActions({ player, onAction, onToggleView, view }: PlayerActionsProps) {
  return (
    <ActionPanel>
      <Action
        title={player.status === "Playing" ? "Pause" : "Play"}
        icon={player.status === "Playing" ? Icon.Pause : Icon.Play}
        shortcut={{ modifiers: ["ctrl"], key: "s" }}
        onAction={() => onAction(player, player.status === "Playing" ? "pause" : "play")}
      />
      <Action
        title="Next"
        icon={Icon.Forward}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowRight" }}
        onAction={() => onAction(player, "next")}
      />
      <Action
        title="Previous"
        icon={Icon.Rewind}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowLeft" }}
        onAction={() => onAction(player, "previous")}
      />
      <Action
        title="Stop"
        icon={Icon.Stop}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
        onAction={() => onAction(player, "stop")}
      />
      <Action
        title={view === "grid" ? "Show Side Panel" : "Show Grid"}
        icon={view === "grid" ? Icon.AppWindowSidebarRight : Icon.AppWindowGrid3x3}
        shortcut={{ modifiers: ["ctrl"], key: "t" }}
        onAction={onToggleView}
      />
    </ActionPanel>
  );
}

function GridView({
  players,
  navigationTitle,
  onAction,
  onToggleView,
  onSelectionChange,
}: {
  players: PlayerInfo[];
  navigationTitle: string;
  onAction: PlayerActionsProps["onAction"];
  onToggleView: () => void;
  onSelectionChange: (name: string) => void;
}) {
  const columns = players.length <= 2 ? 2 : 3;

  return (
    <Grid
      searchBarPlaceholder="Search players..."
      columns={columns}
      aspectRatio="3/2"
      inset={Grid.Inset.Small}
      navigationTitle={navigationTitle}
      onSelectionChange={onSelectionChange}
    >
      <Grid.Section
        title="Media Players"
        columns={columns}
        aspectRatio="3/2"
        inset={Grid.Inset.Small}
      >
        {players.map((player) => (
          <Grid.Item
            key={player.name}
            id={player.displayName}
            title={player.displayName}
            subtitle={playerSubtitle(player)}
            content={coverArt(player)}
            actions={
              <PlayerActions
                player={player}
                onAction={onAction}
                onToggleView={onToggleView}
                view="grid"
              />
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}

function SidePanelView({
  players,
  navigationTitle,
  onAction,
  onToggleView,
  onSelectionChange,
}: {
  players: PlayerInfo[];
  navigationTitle: string;
  onAction: PlayerActionsProps["onAction"];
  onToggleView: () => void;
  onSelectionChange: (name: string) => void;
}) {
  return (
    <List
      isShowingDetail
      searchBarPlaceholder="Search players..."
      navigationTitle={navigationTitle}
      onSelectionChange={(id) => {
        const selected = players.find((player) => player.name === id);
        if (selected) onSelectionChange(selected.displayName);
      }}
    >
      <List.Section title="Media Players">
        {players.map((player) => {
          const metadata = player.metadata;
          const markdown =
            metadata?.albumArt === undefined
              ? ""
              : `![${player.displayName}](${metadata.albumArt})`;

          return (
            <List.Item
              key={player.name}
              id={player.name}
              title={player.displayName}
              subtitle={playerSubtitle(player)}
              icon={coverArt(player)}
              actions={
                <PlayerActions
                  player={player}
                  onAction={onAction}
                  onToggleView={onToggleView}
                  view="side-panel"
                />
              }
              detail={
                <List.Item.Detail
                  markdown={markdown}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Status"
                        text={player.status}
                        icon={statusIcon(player.status)}
                      />
                      <List.Item.Detail.Metadata.Label title="Player" text={player.name} />
                      {metadata?.title && (
                        <List.Item.Detail.Metadata.Label title="Track" text={metadata.title} />
                      )}
                      {metadata?.artist && (
                        <List.Item.Detail.Metadata.Label title="Artist" text={metadata.artist} />
                      )}
                      {metadata?.album && (
                        <List.Item.Detail.Metadata.Label title="Album" text={metadata.album} />
                      )}
                      {metadata?.position !== undefined && (
                        <List.Item.Detail.Metadata.Label
                          title="Position"
                          text={
                            metadata.length === undefined
                              ? formatTime(metadata.position)
                              : `${formatTime(metadata.position)} / ${formatTime(metadata.length)}`
                          }
                        />
                      )}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

export default function PlayerInfoView() {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() =>
    cache.get(VIEW_KEY) === "side-panel" ? "side-panel" : "grid",
  );

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      try {
        const data = await getAllPlayers(getPreferredPlayerNames());
        if (!active) return;
        setPlayers(data);
        if (data.length > 0) {
          setSelectedPlayer((current) => current ?? data[0]!.displayName);
        }
      } catch (error) {
        console.error("Failed to load players", error);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadPlayers();
    // Spawning playerctl is the only way to watch MPRIS; a follow process would
    // stay alive per player instead.
    const interval = setInterval(loadPlayers, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  function toggleView() {
    setView((current) => {
      const next: ViewMode = current === "grid" ? "side-panel" : "grid";
      cache.set(VIEW_KEY, next);
      return next;
    });
  }

  async function run(player: PlayerInfo, action: PlayerCtlPlaybackAction) {
    try {
      await executePlaybackAction(action, player.name);
    } catch (error) {
      await showToast(
        Toast.Style.Failure,
        `Failed to ${action} ${player.displayName}`,
        String(error),
      );
      return;
    }
    await showToast(Toast.Style.Success, `${action} · ${player.displayName}`);
  }

  if (isLoading) {
    return (
      <List searchBarPlaceholder="Search players...">
        <List.EmptyView title="Loading Players" icon={Icon.Clock} />
      </List>
    );
  }

  if (players.length === 0) {
    return (
      <List searchBarPlaceholder="Search players...">
        <List.EmptyView
          title="No Media Players Found"
          description="Start a player playerctl can see, or widen the Players preference"
          icon={Icon.Music}
        />
      </List>
    );
  }

  const navigationTitle = selectedPlayer ? `Players - ${selectedPlayer}` : "Media Players";
  const shared = { players, navigationTitle, onAction: run, onToggleView: toggleView, onSelectionChange: setSelectedPlayer };

  return view === "grid" ? <GridView {...shared} /> : <SidePanelView {...shared} />;
}
