import { Action, ActionPanel, Grid, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  executePlaybackAction,
  getAllPlayers,
  playerSubtitle,
  type PlayerCtlPlaybackAction,
  type PlayerInfo,
  type PlayerStatus,
} from "./utils/playerctl";
import { getPreferredPlayerNames } from "./utils/preferences";

function statusIcon(status: PlayerStatus) {
  if (status === "Playing") return Icon.Play;
  if (status === "Paused") return Icon.Pause;
  return Icon.Stop;
}

export default function PlayerInfoView() {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

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

  async function run(player: PlayerInfo, action: PlayerCtlPlaybackAction) {
    try {
      await executePlaybackAction(action, player.name);
    } catch (error) {
      await showToast(Toast.Style.Failure, `Failed to ${action} ${player.displayName}`, String(error));
      return;
    }
    await showToast(Toast.Style.Success, `${action} · ${player.displayName}`);
  }

  const columns = players.length <= 2 ? 2 : 3;

  if (isLoading) {
    return (
      <Grid searchBarPlaceholder="Search players...">
        <Grid.EmptyView title="Loading Players" icon={Icon.Clock} />
      </Grid>
    );
  }

  if (players.length === 0) {
    return (
      <Grid searchBarPlaceholder="Search players...">
        <Grid.EmptyView
          title="No Media Players Found"
          description="Start a player playerctl can see, or widen the Players preference"
          icon={Icon.Music}
        />
      </Grid>
    );
  }

  return (
    <Grid
      searchBarPlaceholder="Search players..."
      columns={columns}
      aspectRatio="3/2"
      inset={Grid.Inset.Small}
      navigationTitle={selectedPlayer ? `Players - ${selectedPlayer}` : "Media Players"}
      onSelectionChange={setSelectedPlayer}
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
            content={player.metadata?.albumArt || statusIcon(player.status)}
            actions={
              <ActionPanel>
                <Action
                  title={player.status === "Playing" ? "Pause" : "Play"}
                  icon={player.status === "Playing" ? Icon.Pause : Icon.Play}
                  shortcut={{ modifiers: ["ctrl"], key: "s" }}
                  onAction={() => run(player, player.status === "Playing" ? "pause" : "play")}
                />
                <Action
                  title="Next"
                  icon={Icon.Forward}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowRight" }}
                  onAction={() => run(player, "next")}
                />
                <Action
                  title="Previous"
                  icon={Icon.Rewind}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowLeft" }}
                  onAction={() => run(player, "previous")}
                />
                <Action
                  title="Stop"
                  icon={Icon.Stop}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                  onAction={() => run(player, "stop")}
                />
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}
