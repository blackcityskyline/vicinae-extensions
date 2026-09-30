import {
  Action,
  ActionPanel,
  Color,
  Detail,
  getPreferenceValues,
  Icon,
  List,
  LocalStorage,
  showToast,
  Toast,
} from "@vicinae/api";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { searchCities } from "~/utils/cities";
import { sunTimes } from "~/utils/sun";
import { renderTimeline } from "~/utils/timeline";
import {
  CLOCK_WIDTH,
  formatDelta,
  formatGmtOffset,
  hourKind,
  offsetMinutes,
  zoneClock,
  zoneDate,
  zoneDay,
  zoneParts,
} from "~/utils/time";
import { cityOf, coordsOf, DEFAULT_ZONES, zoneOf } from "~/utils/zones";

const ZONES_KEY = "zones";
const BASE_KEY = "base";

const BAND_COLOR = { work: Color.Green, sleep: Color.Red, marginal: Color.Yellow } as const;

function systemZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function scrubTitle(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return absolute === 60 ? `${sign}1 Hour` : `${sign}${absolute} Minutes`;
}

function scrubLabel(minutes: number): string {
  return minutes === 60 ? "1hr" : `${minutes}min`;
}

export default function InTheTimeZone() {
  const preferences = getPreferenceValues<Preferences>();
  const scrub = Number(preferences.defaultScrubMinutes) || 60;
  const altScrub = Number(preferences.optionScrubMinutes) || 30;

  const [at, setAt] = useState(() => new Date());
  const [zones, setZones] = useState<string[] | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([LocalStorage.getItem<string>(ZONES_KEY), LocalStorage.getItem<string>(BASE_KEY)])
      .then(([storedZones, storedBase]) => {
        const saved = storedZones ? (JSON.parse(storedZones) as string[]) : [];
        setZones(saved.length > 0 ? saved : DEFAULT_ZONES);
        setBase(storedBase ?? null);
      })
      .catch((error: unknown) => {
        setZones(DEFAULT_ZONES);
        setBase(null);
        void showToast({
          style: Toast.Style.Failure,
          title: "Could not load saved cities",
          message: error instanceof Error ? error.message : "Using the defaults instead.",
        });
      });
  }, []);

  async function saveZones(next: string[]): Promise<void> {
    setZones(next);
    await LocalStorage.setItem(ZONES_KEY, JSON.stringify(next));

    if (base && !next.includes(base)) await saveBase(null);
  }

  async function saveBase(next: string | null): Promise<void> {
    setBase(next);
    if (next) await LocalStorage.setItem(BASE_KEY, next);
    else await LocalStorage.removeItem(BASE_KEY);
  }

  async function addCity(id: string): Promise<void> {
    const current = zones ?? [];
    if (!current.includes(id)) await saveZones([...current, id]);
    await saveBase(id);
    setSearch("");
  }

  const ids = zones ?? [];
  const baseZone = base ? zoneOf(base) : systemZone();
  const isSystemZone = !base;

  const shown = useMemo(
    () => (base ? [base, ...ids.filter((id) => id !== base)] : ids),
    [base, ids],
  );

  const results = useMemo(
    () => (search.trim() ? searchCities(search, 10).filter((city) => !ids.includes(city.id)) : []),
    [search, ids],
  );

  function shift(minutes: number): void {
    setAt((previous) => new Date(previous.getTime() + minutes * 60_000));
  }

  function reset(): void {
    setAt(new Date());
  }

  /**
   * Bare arrow keys. They are only bound in the timeline: in the list they are
   * what moves the selection, and an action on them would leave the list
   * impossible to walk.
   */
  function scrubSection(): ReactNode {
    return (
      <ActionPanel.Section title="Scrub Time">
        <Action
          title={scrubTitle(-scrub)}
          icon={Icon.ArrowLeft}
          onAction={() => shift(-scrub)}
          shortcut={{ modifiers: [], key: "arrowLeft" }}
        />
        <Action
          title={scrubTitle(scrub)}
          icon={Icon.ArrowRight}
          onAction={() => shift(scrub)}
          shortcut={{ modifiers: [], key: "arrowRight" }}
        />
        <Action
          title={scrubTitle(-altScrub)}
          icon={Icon.ArrowLeftCircle}
          onAction={() => shift(-altScrub)}
          shortcut={{ modifiers: ["alt"], key: "arrowLeft" }}
        />
        <Action
          title={scrubTitle(altScrub)}
          icon={Icon.ArrowRightCircle}
          onAction={() => shift(altScrub)}
          shortcut={{ modifiers: ["alt"], key: "arrowRight" }}
        />
      </ActionPanel.Section>
    );
  }

  if (zones === null) return <Detail markdown="Loading…" />;

  if (view === "timeline") {
    return (
      <Detail
        navigationTitle="Timeline"
        markdown={renderTimeline({ at, zones: shown, base: baseZone })}
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.Label title="Date" text={zoneDate(baseZone, at)} />
            <Detail.Metadata.TagList title="Legend">
              <Detail.Metadata.TagList.Item text="💼 9-5" color={Color.Green} />
              <Detail.Metadata.TagList.Item text="⚠️ 7-9, 5-12" color={Color.Yellow} />
              <Detail.Metadata.TagList.Item text="😴 12-7" color={Color.Red} />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            {shown.map((id) => {
              const zone = zoneOf(id);
              const { lat, lng } = coordsOf(id);
              const sun = sunTimes(lat, lng, at, zone);
              return (
                <Detail.Metadata.Label
                  key={id}
                  title={cityOf(id)}
                  text={`${formatGmtOffset(offsetMinutes(zone, at))}   ↑☀️ ${sun.sunrise}   ↓☀️ ${sun.sunset}`}
                />
              );
            })}
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="← →   ·   Alt+← →   ·   Ctrl+N"
              text={`±${scrubLabel(scrub)}   ±${scrubLabel(altScrub)}   Reset`}
            />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action title="Edit Cities" icon={Icon.Pencil} onAction={() => setView("list")} shortcut={{ modifiers: ["cmd"], key: "e" }} />
            <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["cmd"], key: "n" }} />
            {scrubSection()}
            {base && (
              <ActionPanel.Section title="Settings">
                <Action
                  title="Use System Timezone"
                  icon={Icon.ComputerChip}
                  onAction={() => void saveBase(null)}
                  shortcut={{ modifiers: ["cmd"], key: "0" }}
                />
              </ActionPanel.Section>
            )}
            <ActionPanel.Section>
              <Action.CopyToClipboard title="Copy Base Time" content={at.toISOString()} shortcut={{ modifiers: ["cmd"], key: "c" }} />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  const cities = ids.filter((id) => id !== base);
  const baseOffset = offsetMinutes(baseZone, at);

  return (
    <List
      navigationTitle="In the Timezone"
      searchBarPlaceholder="Search cities to add..."
      searchText={search}
      onSearchTextChange={setSearch}
    >
      {results.length > 0 && (
        <List.Section title="Search Results">
          {results.map((city) => (
            <List.Item
              key={city.id}
              icon={Icon.Globe01}
              title={city.label}
              subtitle={city.zone}
              actions={
                <ActionPanel>
                  <Action title="Add and Set as Base" icon={Icon.Pin} onAction={() => void addCity(city.id)} />
                  <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["cmd"], key: "l" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {!search && (
        <List.Section title="Base Time">
          <List.Item
            icon={{ source: Icon.CircleFilled, tintColor: BAND_COLOR[hourKind(zoneParts(baseZone, at).hour)] }}
            title={`${zoneClock(baseZone, at).padStart(CLOCK_WIDTH)}  ${base ? cityOf(base) : baseZone}`}
            subtitle={`${formatGmtOffset(baseOffset)}${isSystemZone ? " • System timezone" : ""}`}
            accessories={[{ text: zoneDay(baseZone, at) }]}
            actions={
              <ActionPanel>
                <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["cmd"], key: "l" }} />
                <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["cmd"], key: "n" }} />
                {base && (
                  <Action title="Use System Timezone" icon={Icon.ComputerChip} onAction={() => void saveBase(null)} shortcut={{ modifiers: ["cmd"], key: "0" }} />
                )}
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy Base Time" content={at.toISOString()} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {!search && (
        <List.Section title="Cities">
          {cities.length === 0 ? (
            <List.Item title="No cities yet" subtitle="Search for a city to add it" icon={Icon.Plus} />
          ) : (
            cities.map((id) => {
              const zone = zoneOf(id);
              const offset = offsetMinutes(zone, at);
              const clock = zoneClock(zone, at);

              return (
                <List.Item
                  key={id}
                  icon={{ source: Icon.Circle, tintColor: BAND_COLOR[hourKind(zoneParts(zone, at).hour)] }}
                  title={`${clock.padStart(CLOCK_WIDTH)}  ${cityOf(id)}`}
                  subtitle={formatGmtOffset(offset)}
                  accessories={[{ text: formatDelta(offset - baseOffset, "clock") }, { text: zoneDay(zone, at) }]}
                  actions={
                    <ActionPanel>
                      <Action title="Set as Base" icon={Icon.Pin} onAction={() => void saveBase(id)} />
                      <Action
                        title="Remove City"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => void saveZones(cities.filter((other) => other !== id))}
                        shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                      />
                      <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["cmd"], key: "n" }} />
                      <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["cmd"], key: "l" }} />
                    </ActionPanel>
                  }
                />
              );
            })
          )}
        </List.Section>
      )}

      {Boolean(search) && results.length === 0 && (
        <List.EmptyView title="No Results" description={`No cities found for "${search}"`} icon={Icon.MagnifyingGlass} />
      )}
    </List>
  );
}
