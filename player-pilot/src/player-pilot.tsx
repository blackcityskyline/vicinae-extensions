import { Action, ActionPanel, Cache, Grid, Icon, List, environment, showToast, Toast } from "@vicinae/api";
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
import { artworkHref } from "./utils/artwork";
import { CARD_W, COVER_H, ROWS_H, cardToMarkdown, coverCard, factsCard, type Row } from "./lib/cards";

type ViewMode = "grid" | "side-panel";

const cache = new Cache({ namespace: "view" });
const VIEW_KEY = "mode";

function statusIcon(status: PlayerStatus) {
  if (status === "Playing") return Icon.Play;
  if (status === "Paused") return Icon.Pause;
  return Icon.Stop;
}

/**
 * The pane: a cover card with the track on it, then the facts card under it.
 *
 * Two cards because `MdImage.qml` caps one markdown image at `min(200, 0.7 ×
 * pane)`: a single picture leaves the bottom quarter of the pane empty. This is
 * the shape `weather-fox` uses, and the boxes come from the URL, not the SVG.
 *
 * The cover is fetched before it can be drawn (see `utils/artwork`), so the pane
 * shows the facts alone for a moment.
 */
function PlayerDetail({ player }: { player: PlayerInfo }) {
  const [art, setArt] = useState("");
  const artUrl = player.metadata?.albumArt;

  useEffect(() => {
    let active = true;
    if (!artUrl) {
      setArt("");
      return;
    }
    artworkHref(artUrl).then((href) => {
      if (active) setArt(href);
    });
    return () => {
      active = false;
    };
  }, [artUrl]);

  const meta = player.metadata;
  const rows: Row[] = [
    ["Status", player.status],
    ["Player", player.name],
  ];
  if (meta?.title) rows.push(["Track", meta.title]);
  if (meta?.artist) rows.push(["Artist", meta.artist]);
  if (meta?.album) rows.push(["Album", meta.album]);
  if (meta?.position !== undefined) {
    rows.push([
      "Position",
      meta.length === undefined
        ? formatTime(meta.position)
        : `${formatTime(meta.position)} / ${formatTime(meta.length)}`,
    ]);
  }

  const subtitle = [meta?.artist, player.status].filter((part): part is string => Boolean(part)).join(" · ");
  const markdown =
    cardToMarkdown(coverCard(art, meta?.title ?? player.displayName, subtitle), {
      width: CARD_W,
      height: COVER_H,
    }) +
    "\n\n" +
    cardToMarkdown(factsCard(rows, environment.appearance), { width: CARD_W, height: ROWS_H });

  return <List.Item.Detail markdown={markdown} />;
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
        {players.map((player) => (
          <List.Item
            key={player.name}
            id={player.name}
            title={player.displayName}
            subtitle={playerSubtitle(player)}
            icon={coverArt(player)}
            actions={
              <PlayerActions player={player} onAction={onAction} onToggleView={onToggleView} view="side-panel" />
            }
            detail={<PlayerDetail player={player} />}
          />
        ))}
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
