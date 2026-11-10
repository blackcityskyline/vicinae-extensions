import { Action, ActionPanel, Color, Icon, List, Toast, getPreferenceValues, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import MusicForm from "~/components/music-form";
import PresetForm from "~/components/preset-form";
import { spawnMusic } from "~/api/music";
import { readMusic, readPresets, writeMusic, writePresets, type MusicState } from "~/api/store";
import { readTimers, scheduleTimer, stopSound, stopTimer, writeTimers, type Timer } from "~/api/timers";
import { addSource, clampVolume, links, nameOf, removeSource, replaceSource, summary } from "~/utils/music";
import { endsAtText, formatDuration, parseDuration } from "~/utils/parse";
import { addPreset, dropPreset, presetList, replacePreset } from "~/utils/presets";
import { alive, stop } from "~/utils/process";

export default function Command() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [music, setMusic] = useState<MusicState>(() => readMusic());
  const [saved, setSaved] = useState<string[]>(() => readPresets());
  const [typed, setTyped] = useState("");
  const [now, setNow] = useState(Date.now());
  const { push, pop } = useNavigation();
  const prefs = getPreferenceValues<Preferences>();
  const presets = presetList(prefs.presets ?? "", saved);
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

  /** Cancelling a timer stops the sound but keeps the chosen playlist. */
  function stopPlayback(): void {
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

  /** Saves exactly what was typed, so "5m Check laundry" stays that shape. */
  function saveAsPreset(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (presets.some((preset) => preset.text.toLowerCase() === trimmed.toLowerCase())) {
      void showToast({ title: "Already a preset", message: trimmed });
      return;
    }
    const next = addPreset(saved, trimmed);
    writePresets(next);
    setSaved(next);
    void showToast({ title: "Preset saved", message: trimmed });
  }

  /** Rewrites one saved preset; the preference entries cannot be edited here. */
  function renamePreset(original: string, text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return "A preset needs a duration.";
    if (!parseDuration(trimmed)) return "Start with a duration, e.g. 10m Stretch.";
    const next = replacePreset(saved, original, trimmed);
    writePresets(next);
    setSaved(next);
    return null;
  }

  function removePreset(text: string): void {
    const next = dropPreset(saved, text);
    writePresets(next);
    setSaved(next);
  }

  function cancel(timer: Timer): void {
    stopTimer(timer);
    const next = timers.filter((entry) => entry.id !== timer.id);
    setTimers(next);
    writeTimers(next);
    if (next.length === 0) stopPlayback();
  }

  function cancelAll(): void {
    for (const timer of timers) stopTimer(timer);
    setTimers([]);
    writeTimers([]);
    stopPlayback();
  }

  function saveNew(name: string, link: string) {
    const trimmedName = name.trim();
    const url = link.trim();
    if (!trimmedName) return { field: "name" as const, message: "Give the source a name of your own." };
    if (links(url).length === 0) return { field: "link" as const, message: "Paste at least one link or file path." };

    const current = readMusic();
    writeMusic({ ...current, sources: addSource(current.sources, { name: trimmedName, url }) });
    choose(url);
    return null;
  }

  /** Edits one playlist: its own links only, replaced as written. */
  function saveEdit(original: string, name: string, link: string) {
    const trimmedName = name.trim();
    const url = links(link).join("\n");
    if (!trimmedName) return { field: "name" as const, message: "A playlist needs a name." };
    if (!url) return { field: "link" as const, message: "Keep at least one link in the playlist." };

    const current = readMusic();
    const sources = replaceSource(current.sources, original, { name: trimmedName, url });
    if (current.active !== original) {
      writeMusic({ ...current, sources });
    } else {
      // The chosen playlist is now a different set of links: stop the old
      // player and, if a timer is running, start this one.
      if (current.pid) stop(current.pid);
      const pid = timers.length > 0 ? spawnMusic(url, volume, musicFailed) : null;
      writeMusic({ ...current, sources, active: url, pid });
    }
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
      title="New Playlist"
      icon={Icon.Plus}
      shortcut="new"
      onAction={() => push(<MusicForm title="New Playlist" name="" link="" onSave={saveNew} />)}
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
              <Action
                title="Start Timer"
                icon={Icon.Play}
                shortcut={{ modifiers: ["ctrl"], key: "s" }}
                onAction={() => start(parsed.seconds, parsed.note)}
              />
              <Action
                title="Save as Preset"
                icon={Icon.Star}
                shortcut={{ modifiers: ["ctrl", "opt"], key: "p" }}
                onAction={() => saveAsPreset(typed)}
              />
            </ActionPanel>
          }
        />
      )}

      <List.Item
        title="Stop Timer Sound"
        icon={Icon.SpeakerOff}
        actions={
          <ActionPanel>
            <Action
              title="Stop Timer Sound"
              icon={Icon.SpeakerOff}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
              onAction={stopSound}
            />
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
                  <Action
                    title="Cancel Timer"
                    icon={Icon.Stop}
                    style={Action.Style.Destructive}
                    shortcut="remove"
                    onAction={() => cancel(timer)}
                  />
                  <Action
                    title="Save as Preset"
                    icon={Icon.Star}
                    shortcut={{ modifiers: ["ctrl", "opt"], key: "p" }}
                    onAction={() =>
                      saveAsPreset(timer.note === "Timer" ? timer.name : `${timer.name} ${timer.note}`)
                    }
                  />
                  <Action.CopyToClipboard title="Copy Timer Note" content={timer.note} shortcut="copy" />
                  <Action
                    title="Cancel All Timers"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut="remove-all"
                    onAction={cancelAll}
                  />
                  <Action
                    title="Stop Timer Sound"
                    icon={Icon.SpeakerOff}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "s" }}
                    onAction={stopSound}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {!typed && presets.length > 0 && (
        <List.Section title="Presets">
          {presets.map((preset) => {
            const parsedPreset = parseDuration(preset.text);
            if (!parsedPreset) return null;
            return (
              <List.Item
                key={preset.text}
                title={formatDuration(parsedPreset.seconds)}
                subtitle={parsedPreset.note}
                icon={Icon.Star}
                actions={
                  <ActionPanel>
                    <Action
                      title="Start Preset"
                      icon={Icon.Play}
                      shortcut={{ modifiers: ["ctrl"], key: "s" }}
                      onAction={() => start(parsedPreset.seconds, parsedPreset.note)}
                    />
                    {preset.saved && (
                      <Action
                        title="Edit Preset"
                        icon={Icon.Pencil}
                        shortcut="edit"
                        onAction={() =>
                          push(
                            <PresetForm
                              text={preset.text}
                              onSave={(next) => {
                                const problem = renamePreset(preset.text, next);
                                if (problem === null) pop();
                                return problem;
                              }}
                            />,
                          )
                        }
                      />
                    )}
                    {preset.saved && (
                      <Action
                        title="Remove Preset"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut="remove"
                        onAction={() => removePreset(preset.text)}
                      />
                    )}
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
                <Action
                  title="Use Silence"
                  icon={Icon.SpeakerOff}
                  shortcut={{ modifiers: ["ctrl"], key: "0" }}
                  onAction={() => choose("")}
                />
                {musicActions}
              </ActionPanel>
            }
          />
          {music.sources.map((source, index) => {
            const isActive = music.active === source.url;
            return (
              <List.Item
                key={source.url}
                id={`music-${index}`}
                title={source.name}
                subtitle={summary(source.url)}
                icon={isActive && playing ? Icon.Speaker : Icon.Music}
                accessories={isActive ? [{ text: playing ? "Playing" : "Selected" }] : undefined}
                actions={
                  <ActionPanel>
                    <Action
                      title={isActive ? "Play Again" : "Use This Music"}
                      icon={Icon.Play}
                      shortcut={{ modifiers: ["ctrl"], key: "u" }}
                      onAction={() => choose(source.url)}
                    />
                    <Action
                      title="Add Links…"
                      icon={Icon.Plus}
                      shortcut="edit"
                      onAction={() =>
                        push(
                          <MusicForm
                            title={source.name}
                            name={source.name}
                            link={source.url}
                            focusLinks
                            onSave={(name, link) => saveEdit(source.url, name, link)}
                          />,
                        )
                      }
                    />
                    <Action
                      title="Remove"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut="remove"
                      onAction={() => remove(source.url)}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
          <List.Item
            id="music-add"
            title="New Playlist"
            subtitle="Give it a name; its links are added inside it"
            icon={Icon.Plus}
            actions={<ActionPanel>{musicActions}</ActionPanel>}
          />
        </List.Section>
      )}
    </List>
  );
}
