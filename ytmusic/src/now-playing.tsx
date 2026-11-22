import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  Toast,
  environment,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import { control, jump, playerState, setVolume } from "~/api/backend";
import { VOLUME_MAX, type ControlAction, type PlayerState, type RepeatMode } from "~/api/mpv";
import { buildMusicConfig, type MusicConfig } from "~/api/player";
import { queueRows, readQueueTracks, type QueueRow, type QueueTrack } from "~/api/queue";
import { configureInk, useTrackPane, type Pane, type Row } from "~/lib/pane";
import { coverUrl, iconUrl, thumbnailUrl, videoIdFromUrl } from "~/utils/ytmusic";

configureInk(environment.appearance);

const REPEAT_NAMES: Record<RepeatMode, string> = {
  off: "Off",
  all: "All",
  one: "One",
};

function clock(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function progress(state: PlayerState): string | undefined {
  const position = clock(state.position);
  const duration = clock(state.duration);
  if (!position) return undefined;
  return duration ? `${position} / ${duration}` : position;
}

function volumeIcon(state: PlayerState): Icon {
  if (state.muted) return Icon.SpeakerOff;
  if (state.volume <= 0) return Icon.SpeakerOff;
  if (state.volume < 45) return Icon.SpeakerLow;
  return Icon.SpeakerHigh;
}

function facts(state: PlayerState): string {
  return [
    progress(state),
    state.muted ? "Muted" : `${state.volume}%`,
    state.count > 0 ? `${state.index} of ${state.count}` : undefined,
    state.repeat === "off" ? undefined : `Repeat ${REPEAT_NAMES[state.repeat].toLowerCase()}`,
    state.shuffle ? "Shuffle" : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** The 1280×720 frame, with the 4:3 one most uploads still have as a fallback. */
function artOf(videoId: string | undefined): Pick<Pane, "cover" | "coverFallback"> {
  return {
    cover: videoId ? coverUrl(videoId) : undefined,
    coverFallback: videoId ? thumbnailUrl(videoId) : undefined,
  };
}

function indexTracks(tracks: QueueTrack[]): Map<string, QueueTrack> {
  return new Map(tracks.map((track) => [track.videoId, track]));
}

/** One queue row's pane: the cover, what it is, and where it sits in the list. */
function queuePane(row: QueueRow, shown: number, total: number): Pane {
  return {
    ...artOf(row.videoId),
    title: row.title,
    subtitle: row.artists || undefined,
    rows: [
      ["Position", `${shown + 1} of ${total}`],
      ["Video", row.videoId],
    ] satisfies Row[],
  };
}

/** The two cards; a hook, so every row that has one owns its own fetch. */
function TrackPane({ pane }: { pane: Pane }) {
  return <List.Item.Detail markdown={useTrackPane(pane)} />;
}

/**
 * What a queue row shows before it is selected: a plain picture, no card.
 * A card needs the bytes fetched and embedded, and Vicinae mounts the pane of
 * every row at once — a hundred covers would be downloaded for the one on
 * screen.
 */
function PlainPane({ row, shown, total }: { row: QueueRow; shown: number; total: number }) {
  const thumbnail = thumbnailUrl(row.videoId);
  return (
    <List.Item.Detail
      markdown={[
        thumbnail ? `![](${thumbnail})` : "",
        `**${row.title}**`,
        row.artists ?? "",
      ]
        .filter((part) => part !== "")
        .join("\n\n")}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Position" text={`${shown + 1} of ${total}`} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function VolumeForm({
  config,
  current,
  onDone,
}: {
  config: MusicConfig;
  current: number;
  onDone: () => void;
}) {
  const { pop } = useNavigation();
  const [text, setText] = useState(String(current));

  const submit = async (): Promise<void> => {
    const parsed = Number(text.trim());
    if (!Number.isFinite(parsed)) {
      await showToast(Toast.Style.Failure, "Invalid volume", `Enter a number between 0 and ${VOLUME_MAX}`);
      return;
    }

    const applied = await setVolume(config, parsed);
    if (applied !== null) {
      await showToast(Toast.Style.Success, "Volume updated", `${config.backend === "daemon" ? "ytmusicd" : "mpv"} → ${applied}%`);
      onDone();
    }
    pop();
  };

  return (
    <Form
      navigationTitle="Set Volume"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply" shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="volume"
        title="Volume (%)"
        value={text}
        onChange={setText}
        info={`0 - ${VOLUME_MAX}`}
      />
      <Form.Dropdown id="preset" title="Presets" defaultValue="" onChange={(value) => value && setText(value)}>
        <Form.Dropdown.Item title="—" value="" />
        {["0", "25", "50", "75", "100", String(VOLUME_MAX)].map((value) => (
          <Form.Dropdown.Item key={value} title={`${value}%`} value={value} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

/**
 * The shared mpv's state. Polling only runs while this view is open: the interval is cleared
 * when it unmounts, so a closed launcher leaves mpv alone.
 */
export function NowPlayingView({ config }: { config: MusicConfig }) {
  const [state, setState] = useState<PlayerState | null>(null);
  const [tracks, setTracks] = useState<Map<string, QueueTrack>>(() =>
    indexTracks(readQueueTracks(config)),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  /** The queue row whose pane is mounted with a card; the rest keep a plain one. */
  const [selected, setSelected] = useState("playing");

  useEffect(() => {
    let cancelled = false;

    const tick = async (): Promise<void> => {
      const found = await playerState(config).catch(() => null);
      if (cancelled) return;
      setState(found);
      setIsLoading(false);
    };

    void tick();
    const timer = setInterval(() => void tick(), 1_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [config, revision]);

  const queueKey = state?.queue.join("\n") ?? "";
  useEffect(() => {
    setTracks(indexTracks(readQueueTracks(config)));
  }, [config, queueKey]);

  const refresh = (): void => setRevision((value) => value + 1);

  const send = (action: ControlAction): void => {
    void control(config, action).finally(refresh);
  };

  const actions = (state: PlayerState | null, row?: QueueRow) => (
    <ActionPanel>
      {row ? (
        <Action
          title="Play This Track"
          icon={Icon.Play}
          shortcut="open"
          onAction={() => void jump(config, row.position).finally(refresh)}
        />
      ) : state ? (
        <Action
          title={state.paused ? "Resume" : "Pause"}
          icon={state.paused ? Icon.Play : Icon.Pause}
          shortcut="open"
          onAction={() => send("toggle")}
        />
      ) : null}
      {row ? (
        <Action.OpenInBrowser
          title="Open in YouTube Music"
          url={row.url}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
        />
      ) : null}
      {row && state ? (
        <Action
          title={state.paused ? "Resume" : "Pause"}
          icon={state.paused ? Icon.Play : Icon.Pause}
          onAction={() => send("toggle")}
        />
      ) : null}
      <Action
        title="Next"
        icon={Icon.Forward}
        shortcut={{ modifiers: ["ctrl"], key: "arrowRight" }}
        onAction={() => send("next")}
      />
      <Action
        title="Previous"
        icon={Icon.Rewind}
        shortcut={{ modifiers: ["ctrl"], key: "arrowLeft" }}
        onAction={() => send("previous")}
      />
      <ActionPanel.Section title="Volume">
        <Action
          title="Increase Volume (+5%)"
          icon={Icon.SpeakerUp}
          shortcut={{ modifiers: ["ctrl"], key: "arrowUp" }}
          onAction={() => send("volumeUp")}
        />
        <Action
          title="Decrease Volume (-5%)"
          icon={Icon.SpeakerDown}
          shortcut={{ modifiers: ["ctrl"], key: "arrowDown" }}
          onAction={() => send("volumeDown")}
        />
        <Action.Push
          title="Set Volume…"
          icon={Icon.Gauge}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }}
          target={
            <VolumeForm config={config} current={state?.volume ?? 100} onDone={refresh} />
          }
        />
        <Action
          title={state?.muted ? "Unmute" : "Mute"}
          icon={state?.muted ? Icon.SpeakerOff : Icon.SpeakerOn}
          shortcut={{ modifiers: ["ctrl"], key: "m" }}
          onAction={() => send("mute")}
        />
      </ActionPanel.Section>
      {state ? (
        <Action
          title={state.shuffle ? "Turn Shuffle Off" : "Turn Shuffle On"}
          icon={Icon.Shuffle}
          shortcut={{ modifiers: ["ctrl"], key: "s" }}
          onAction={() => send("shuffle")}
        />
      ) : null}
      {state ? (
        <Action
          title={`Repeat: ${REPEAT_NAMES[state.repeat]}`}
          icon={Icon.Repeat}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
          onAction={() => send("repeat")}
        />
      ) : null}
      <Action
        title="Stop"
        icon={Icon.Stop}
        shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
        onAction={() => send("stop")}
      />
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["ctrl"], key: "r" }} onAction={refresh} />
    </ActionPanel>
  );

  const playing = state?.path ? videoIdFromUrl(state.path) : undefined;
  const playingTrack = playing ? tracks.get(playing) : undefined;
  const queue = state ? queueRows(state, tracks) : [];
  const currentIndex = state ? state.index - 1 : -1;

  const current: Pane = {
    ...artOf(playing),
    title: playingTrack?.title ?? state?.title ?? "Untitled",
    subtitle: playingTrack?.artists.join(", "),
    rows: state
      ? [
          ["Progress", progress(state) ?? "—"],
          ["Repeat", REPEAT_NAMES[state.repeat]],
          ["Shuffle", state.shuffle ? "On" : "Off"],
        ]
      : [],
  };

  return (
    <List
      navigationTitle="Now Playing"
      isLoading={isLoading}
      isShowingDetail
      onSelectionChange={setSelected}
      actions={actions(state)}
    >
      {state ? (
        <List.Section title="Now Playing">
          <List.Item
            id="playing"
            title={state.title ?? "Untitled"}
            subtitle={facts(state)}
            icon={
              playing
                ? { source: iconUrl(thumbnailUrl(playing)) }
                : state.paused
                  ? Icon.Pause
                  : Icon.Music
            }
            accessories={[
              { icon: volumeIcon(state), text: `${state.volume}%` },
              ...(state.count > 0 ? [{ text: `${state.index} of ${state.count}` }] : []),
            ]}
            detail={<TrackPane pane={current} />}
            actions={actions(state)}
          />
        </List.Section>
      ) : (
        <List.EmptyView
          icon={Icon.Headphones}
          title="Nothing is playing"
          description="Play a song from Browse YouTube Music."
          actions={actions(state)}
        />
      )}
      {queue.length > 0 ? (
        <List.Section title="Queue">
          {queue.map((row, shown) => (
            <List.Item
              key={`${row.position}:${row.url}`}
              id={`queue:${row.position}`}
              title={row.title}
              subtitle={row.artists}
              icon={{ source: iconUrl(thumbnailUrl(row.videoId)) }}
              active={row.position === currentIndex}
              accessories={[
                { text: String(shown + 1) },
                ...(row.position === currentIndex && state?.paused ? [{ icon: Icon.Pause }] : []),
              ]}
              detail={
                selected === `queue:${row.position}` ? (
                  <TrackPane pane={queuePane(row, shown, queue.length)} />
                ) : (
                  <PlainPane row={row} shown={shown} total={queue.length} />
                )
              }
              actions={actions(state, row)}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

export default function NowPlayingCommand() {
  const [config] = useState(() => buildMusicConfig(getPreferenceValues()));
  return <NowPlayingView config={config} />;
}
