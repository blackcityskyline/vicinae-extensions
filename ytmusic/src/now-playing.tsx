import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import {
  VOLUME_MAX,
  control,
  jump,
  playerState,
  setVolume,
  type ControlAction,
  type PlayerState,
  type RepeatMode,
} from "~/api/mpv";
import { buildMusicConfig, type MusicConfig } from "~/api/player";
import { readQueueTracks, type QueueTrack } from "~/api/queue";
import { thumbnailUrl, videoIdFromUrl } from "~/utils/ytmusic";

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

/** The cover YouTube serves for the video mpv is playing, when it is a song. */
function coverOf(url: string | undefined): string | undefined {
  const videoId = url ? videoIdFromUrl(url) : undefined;
  return videoId ? thumbnailUrl(videoId) : undefined;
}

function indexTracks(tracks: QueueTrack[]): Map<string, QueueTrack> {
  return new Map(tracks.map((track) => [track.videoId, track]));
}

type QueueRow = {
  position: number;
  url: string;
  videoId?: string;
  title: string;
  artists?: string;
  thumbnail?: string;
};

/** mpv queues URLs; the titles and covers come from what Browse remembered. */
function queueRows(state: PlayerState, tracks: Map<string, QueueTrack>): QueueRow[] {
  return state.queue.map((url, position) => {
    const videoId = videoIdFromUrl(url);
    const track = videoId ? tracks.get(videoId) : undefined;
    const thumbnail = track?.thumbnail ?? coverOf(url);
    return {
      position,
      url,
      videoId,
      title: track?.title ?? titleFromUrl(url),
      artists: track?.artists.join(", "),
      thumbnail,
    };
  });
}

function titleFromUrl(url: string): string {
  const videoId = videoIdFromUrl(url);
  return videoId ? `Video ${videoId}` : url;
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
      await showToast(Toast.Style.Success, "Volume updated", `mpv → ${applied}%`);
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

  const currentCover = state ? coverOf(state.path) : undefined;
  const queue = state ? queueRows(state, tracks) : [];
  const currentIndex = state ? state.index - 1 : -1;

  return (
    <List navigationTitle="Now Playing" isLoading={isLoading} isShowingDetail actions={actions(state)}>
      {state ? (
        <List.Section title="Now Playing">
          <List.Item
            title={state.title ?? "Untitled"}
            subtitle={facts(state)}
            icon={currentCover ? { source: currentCover } : state.paused ? Icon.Pause : Icon.Music}
            accessories={[
              { icon: volumeIcon(state), text: `${state.volume}%` },
              ...(state.count > 0 ? [{ text: `${state.index} of ${state.count}` }] : []),
            ]}
            detail={
              <List.Item.Detail
                markdown={[currentCover ? `![](${currentCover})` : "", `**${state.title ?? "Untitled"}**`]
                  .filter((part) => part !== "")
                  .join("\n\n")}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Queue" text={`${state.index} of ${state.count}`} />
                    <List.Item.Detail.Metadata.Label
                      title="Volume"
                      text={state.muted ? `Muted · ${state.volume}%` : `${state.volume}%`}
                    />
                    <List.Item.Detail.Metadata.Label title="Progress" text={progress(state) ?? "—"} />
                    <List.Item.Detail.Metadata.Label title="Repeat" text={REPEAT_NAMES[state.repeat]} />
                    <List.Item.Detail.Metadata.Label title="Shuffle" text={state.shuffle ? "On" : "Off"} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
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
          {queue.map((row) => (
            <List.Item
              key={`${row.position}:${row.url}`}
              title={row.title}
              subtitle={row.artists}
              icon={row.thumbnail ? { source: row.thumbnail } : Icon.Music}
              active={row.position === currentIndex}
              accessories={[
                { text: String(row.position + 1) },
                ...(row.position === currentIndex && state?.paused ? [{ icon: Icon.Pause }] : []),
              ]}
              detail={
                <List.Item.Detail
                  markdown={[
                    row.thumbnail ? `![](${row.thumbnail})` : "",
                    `**${row.title}**`,
                    row.artists ?? "",
                  ]
                    .filter((part) => part !== "")
                    .join("\n\n")}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Position" text={`${row.position + 1} of ${queue.length}`} />
                      {row.videoId ? (
                        <List.Item.Detail.Metadata.Link
                          title="YouTube Music"
                          text={row.videoId}
                          target={row.url}
                        />
                      ) : null}
                    </List.Item.Detail.Metadata>
                  }
                />
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
