import { Action, ActionPanel, Color, Icon, List, Toast, getPreferenceValues, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import MusicForm from "~/components/music-form";
import { spawnMusic } from "~/api/music";
import { readMusic, writeMusic, type MusicState } from "~/api/store";
import { readTimers, scheduleTimer, stopSound, stopTimer, writeTimers, type Timer } from "~/api/timers";
import { addSource, clampVolume, nameOf, removeSource, renameSource } from "~/utils/music";
import { endsAtText, formatDuration, parseDuration } from "~/utils/parse";
import { alive, stop } from "~/utils/process";

export default function Command() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [music, setMusic] = useState<MusicState>(() => readMusic());
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(Date.now());
  const { push } = useNavigation();
  const prefs = getPreferenceValues<Preferences>();
  const presets = (prefs.presets ?? "")
    .split(",")
    .map((preset) => preset.trim())
    .filter(Boolean);
  const volume = clampVolume(prefs.musicVolume);

  useEffect(() => {
    setTimers(readTimers());
    const interval = setInterval(() => {
      setNow(Date.now());
      setTimers((current) => {
        const live = current.filter((timer) => timer.targetEpoch > Date.now());
        if (live.length !== current.length) writeTimers(live);
        return live;
      });
      // The unit removes the pid file when it stops the music at the deadline,
      // so "Playing" has to be read back, not remembered.
      setMusic(readMusic());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /** mpv missing or unplayable: say so once, the timer still runs. */
  function musicFailed(): void {
    void showToast({
      style: Toast.Style.Failure,
      title: "Music did not start",
      message: "Install mpv, and yt-dlp for the YouTube links.",
    });
  }

  const parsed = parseDuration(typed);
  const playing = alive(music.pid);
  const chosen = music.active ? nameOf(music.sources, music.active) : "Silence";

  function silence(): void {
    const current = readMusic();
    if (current.pid) stop(current.pid);
    const next = { ...current, pid: null };
    writeMusic(next);
    setMusic(next);
  }

  /** Selection is saved; music only plays while a timer runs. */
  function choose(url: string): void {
    const current = readMusic();
    if (current.pid) stop(current.pid);
    const pid = url && timers.length > 0 ? spawnMusic(url, volume, musicFailed) : null;
    const next = { ...current, active: url, pid };
    writeMusic(next);
    setMusic(next);
  }

  function start(seconds: number, note: string): void {
    let state = readMusic();
    if (state.active && !alive(state.pid)) {
      state = { ...state, pid: spawnMusic(state.active, volume, musicFailed) };
      writeMusic(state);
      setMusic(state);
    }

    let timer: Timer;
    try {
      timer = scheduleTimer(seconds, note, prefs.soundRepeat === "until_disabled");
    } catch {
      void showToast({
        style: Toast.Style.Failure,
        title: "Failed to start timer",
        message: "Ensure 'systemd' and 'libnotify' are installed.",
      });
      return;
    }
    const next = [timer, ...timers];
    setTimers(next);
    writeTimers(next);
    setTyped("");
  }

  function cancel(timer: Timer): void {
    stopTimer(timer);
    const next = timers.filter((entry) => entry.id !== timer.id);
    setTimers(next);
    writeTimers(next);
    if (next.length === 0) silence();
  }

  function cancelAll(): void {
    for (const timer of timers) stopTimer(timer);
    setTimers([]);
    writeTimers([]);
    silence();
  }

  function saveNew(name: string, link: string) {
    const trimmedName = name.trim();
    const url = link.trim();
    if (!trimmedName) return { field: "name" as const, message: "Give the source a name of your own." };
    if (!url) return { field: "link" as const, message: "Paste a link or a file path to play." };

    const current = readMusic();
    writeMusic({ ...current, sources: addSource(current.sources, { name: trimmedName, url }) });
    choose(url);
    return null;
  }

  function saveName(url: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return { field: "name" as const, message: "A source needs a name." };
    const current = readMusic();
    writeMusic({ ...current, sources: renameSource(current.sources, url, trimmed) });
    setMusic(readMusic());
    return null;
  }

  function remove(url: string): void {
    const current = readMusic();
    const sources = removeSource(current.sources, url);
    if (current.active !== url) {
      writeMusic({ ...current, sources });
    } else {
      if (current.pid) stop(current.pid);
      writeMusic({ sources, active: "", pid: null });
    }
    setMusic(readMusic());
  }

  const musicActions = (
    <Action
      title="Add Music Source…"
      icon={Icon.Plus}
      shortcut={{ modifiers: ["cmd"], key: "n" }}
      onAction={() => push(<MusicForm title="Add Music Source" name="" link="" withLink onSave={saveNew} />)}
    />
  );

  return (
    <List
      searchText={typed}
      onSearchTextChange={setTyped}
      searchBarPlaceholder="Duration and optional note (e.g., 5m Check laundry)"
    >
      {parsed && (
        <List.Item
          title={`Start timer for ${formatDuration(parsed.seconds)}`}
          subtitle={`${parsed.note} · music: ${chosen}`}
          icon={{ source: Icon.Clock, tintColor: Color.Green }}
          actions={
            <ActionPanel>
              <Action title="Start Timer" icon={Icon.Play} onAction={() => start(parsed.seconds, parsed.note)} />
            </ActionPanel>
          }
        />
      )}

      <List.Item
        title="Stop Timer Sound"
        icon={Icon.SpeakerOff}
        actions={
          <ActionPanel>
            <Action title="Stop Timer Sound" icon={Icon.SpeakerOff} onAction={stopSound} />
          </ActionPanel>
        }
      />

      {timers.length > 0 && (
        <List.Section title="Active Timers">
          {timers.map((timer) => (
            <List.Item
              key={timer.id}
              title={formatDuration((timer.targetEpoch - now) / 1000)}
              subtitle={timer.note}
              icon={Icon.Stopwatch}
              accessories={[{ text: `Ends at ${endsAtText(timer.targetEpoch)}`, icon: Icon.Calendar }]}
              actions={
                <ActionPanel>
                  <Action title="Cancel Timer" icon={Icon.Stop} style={Action.Style.Destructive} onAction={() => cancel(timer)} />
                  <Action.CopyToClipboard title="Copy Timer Note" content={timer.note} shortcut={{ modifiers: ["ctrl"], key: "c" }} />
                  <Action
                    title="Cancel All Timers"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "backspace" }}
                    onAction={cancelAll}
                  />
                  <Action title="Stop Timer Sound" icon={Icon.SpeakerOff} onAction={stopSound} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {!typed && presets.length > 0 && (
        <List.Section title="Presets">
          {presets.map((preset) => {
            const parsedPreset = parseDuration(preset);
            if (!parsedPreset) return null;
            return (
              <List.Item
                key={preset}
                title={formatDuration(parsedPreset.seconds)}
                subtitle={parsedPreset.note}
                icon={Icon.Star}
                actions={
                  <ActionPanel>
                    <Action
                      title="Start Preset"
                      icon={Icon.Play}
                      onAction={() => start(parsedPreset.seconds, parsedPreset.note)}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      {!typed && (
        <List.Section title="Music">
          <List.Item
            id="music-silence"
            title="Silence"
            subtitle="No music, the default"
            icon={Icon.SpeakerOff}
            accessories={music.active === "" ? [{ text: "Selected" }] : undefined}
            actions={
              <ActionPanel>
                <Action title="Use Silence" icon={Icon.SpeakerOff} onAction={silence} />
                {musicActions}
              </ActionPanel>
            }
          />
          {music.sources.map((source) => {
            const isActive = music.active === source.url;
            return (
              <List.Item
                key={source.url}
                id={`music-${source.url}`}
                title={source.name}
                subtitle={source.url}
                icon={isActive && playing ? Icon.Speaker : Icon.Music}
                accessories={isActive ? [{ text: playing ? "Playing" : "Selected" }] : undefined}
                actions={
                  <ActionPanel>
                    <Action
                      title={isActive ? "Play Again" : "Use This Music"}
                      icon={Icon.Play}
                      onAction={() => choose(source.url)}
                    />
                    <Action
                      title="Rename…"
                      icon={Icon.Pencil}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={() =>
                        push(
                          <MusicForm
                            title="Rename Music Source"
                            name={source.name}
                            link={source.url}
                            withLink={false}
                            onSave={(name) => saveName(source.url, name)}
                          />,
                        )
                      }
                    />
                    {musicActions}
                    <Action
                      title="Remove"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "backspace" }}
                      onAction={() => remove(source.url)}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
          <List.Item
            id="music-add"
            title="Add Music Source…"
            subtitle="Any name you like, and the link it plays"
            icon={Icon.Plus}
            actions={<ActionPanel>{musicActions}</ActionPanel>}
          />
        </List.Section>
      )}
    </List>
  );
}
