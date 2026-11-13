import {
  Action,
  ActionPanel,
  Color,
  Detail,
  environment,
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
import { getHourType } from "~/utils/palette";
import { sunTimes } from "~/utils/sun";
import { generateTimelineSvg, type SunPair } from "~/utils/svg-timeline";
import {
  clockFormat,
  formatDelta,
  formatGmtOffset,
  localNoon,
  offsetMinutes,
  sortZones,
  zoneClock,
  zoneDay,
  zoneParts,
  type ClockFormatPreference,
  type CityOrder,
} from "~/utils/time";
import { cityOf, coordsOf, DEFAULT_ZONES, zoneOf } from "~/utils/zones";

const ZONES_KEY = "zones";
const BASE_KEY = "base";

const BAND_COLOR = { work: Color.Yellow, sleep: Color.Blue, marginal: Color.Orange } as const;

function systemZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Where the user is: a listed city in the system time zone keeps its name and
 * sunrise data, otherwise the bare system zone id stands in for the place.
 */
function resolveLocalCityId(ids: string[]): string {
  const zone = systemZone();
  return ids.find((id) => zoneOf(id) === zone) ?? zone;
}

/** Truncated to the minute, so the clock re-renders once a minute, not per tick. */
function currentMinute(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000);
}

/**
 * The instant of the nearest multiple of `stepMinutes` on the zone's local
 * clock, strictly after (direction 1) or before (direction -1) `at`.
 *
 * Around a daylight saving change the nearest grid point is not always the next
 * one in clock order: in the repeated hour an earlier clock time can still lie
 * ahead, and skipped clock times do not exist. So grid points within three
 * hours on both sides are checked, and the nearest valid one wins.
 */
function snapToGrid(at: Date, zone: string, stepMinutes: number, direction: 1 | -1): Date {
  const parts = zoneParts(zone, at);
  const minuteOfDay = parts.hour * 60 + parts.minute + (parts.second * 1000 + at.getMilliseconds()) / 60_000;
  const first = direction > 0 ? Math.floor(minuteOfDay / stepMinutes) : Math.ceil(minuteOfDay / stepMinutes);
  const window = Math.ceil(180 / stepMinutes);

  let nearest: number | undefined;
  for (let i = -window; i <= window; i++) {
    for (const occurrence of localOccurrences(zone, parts.day, (first + i * direction) * stepMinutes)) {
      const distance = direction * (occurrence.getTime() - at.getTime());
      if (distance > 0 && (!nearest || distance < nearest)) nearest = distance;
    }
  }
  return new Date(at.getTime() + (nearest ?? direction * stepMinutes * 60_000));
}

/**
 * The instants at which the zone's clock shows the given minutes after the
 * start of the day: usually one, two in the hour repeated when daylight saving
 * time ends, and none in the hour it skips.
 */
function localOccurrences(zone: string, day: number, minutes: number): Date[] {
  const days = Math.floor(minutes / 1440);
  const localMinutes = minutes - days * 1440;
  // Wall-clock milliseconds since the epoch, before an offset is subtracted.
  const wallMs = (day + days) * 86_400_000 + localMinutes * 60_000;
  const offsets = new Set([
    offsetMinutes(zone, new Date(wallMs - 6 * 3_600_000)),
    offsetMinutes(zone, new Date(wallMs + 6 * 3_600_000)),
  ]);
  return [...offsets]
    .map((offset) => new Date(wallMs - offset * 60_000))
    .filter((at) => {
      const parts = zoneParts(zone, at);
      return parts.day === day + days && parts.hour * 60 + parts.minute === localMinutes;
    });
}

function scrubTitle(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return absolute === 60 ? `${sign}1 Hour` : `${sign}${absolute} Minutes`;
}

function snapTitle(minutes: number, direction: 1 | -1): string {
  return `Snap to ${direction > 0 ? "Next" : "Previous"} ${minutes === 60 ? "Hour" : `${minutes} Minutes`}`;
}

export default function Command() {
  const [nowAt, setNowAt] = useState<Date>(currentMinute);
  // null while the cursor follows the current time; set once the user scrubs away from it
  const [cursorAt, setCursorAt] = useState<Date | null>(null);
  const [zones, setZones] = useState<string[] | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [search, setSearch] = useState("");

  const preferences = getPreferenceValues<Preferences>();
  const scrub = parseInt(preferences.defaultScrubMinutes ?? "", 10) || 60;
  const altScrub = parseInt(preferences.optionScrubMinutes ?? "", 10) || 30;
  const timeFormat = clockFormat(preferences.timeFormat as ClockFormatPreference | undefined);
  const showLocal = preferences.showLocalTimezone ?? true;
  const order = (preferences.cityOrder as CityOrder | undefined) ?? "offset-asc";

  useEffect(() => {
    const load = async () => {
      try {
        const [storedZones, storedBase] = (await Promise.all([
          LocalStorage.getItem<string>(ZONES_KEY),
          LocalStorage.getItem<string>(BASE_KEY),
        ])) as [string | null, string | null];

        const parsed = storedZones ? (JSON.parse(storedZones) as string[]) : null;
        setZones(parsed && parsed.length > 0 ? parsed : [...DEFAULT_ZONES]);
        setBase(storedBase ?? null);
      } catch (error) {
        setZones([...DEFAULT_ZONES]);
        setBase(null);
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not load saved cities",
          message: error instanceof Error ? error.message : "Using defaults instead",
        });
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = currentMinute();
      setNowAt((previous) => (previous.getTime() === next.getTime() ? previous : next));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function saveZones(next: string[]): Promise<void> {
    const cleaned = next.filter(Boolean);
    setZones(cleaned);
    await LocalStorage.setItem(ZONES_KEY, JSON.stringify(cleaned));

    if (base && !cleaned.includes(base)) await saveBase(null);
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
  const localId = useMemo(() => resolveLocalCityId(ids), [ids]);
  const baseId = base ?? localId;
  const baseZone = zoneOf(baseId);
  const at = cursorAt ?? nowAt;

  // The timeline shows the pinned cities, ordered by the preference, plus a
  // Local row when the pinned base is somewhere else and the user's own zone is
  // not already on the timeline. The Local row is never saved with the cities.
  const timelineZones = useMemo(() => {
    const withLocal =
      showLocal && base !== null && zoneOf(localId) !== zoneOf(base) && !ids.includes(localId)
        ? [...ids, localId]
        : ids;
    return sortZones(withLocal, at, order);
  }, [showLocal, base, localId, ids, at, order]);

  // Sunrise and sunset belong to each city's local date at the cursor: they are
  // computed at the local noon, keyed by the city id like the SVG expects. The
  // key changes only when a city or a local date does, so scrubbing inside one
  // date does not recompute the sun. City ids contain `|`, so the key cannot
  // join on it: these separators are control characters an id can never hold.
  const sunKey = timelineZones
    .map((id) => `${id}\u0001${localNoon(zoneOf(id), at).getTime()}`)
    .join("\u0002");
  const sunTimesByCity = useMemo(() => {
    // Empty before the saved cities load: an empty key means nothing to read.
    if (sunKey === "") return {};
    const result: Record<string, SunPair> = {};
    for (const entry of sunKey.split("\u0002")) {
      const id = entry.slice(0, entry.lastIndexOf("\u0001"));
      const zone = zoneOf(id);
      const { lat, lng } = coordsOf(id);
      result[id] = sunTimes(lat, lng, localNoon(zone, at), zone);
    }
    return result;
  }, [sunKey]);

  const results = useMemo(
    () => (search.trim() ? searchCities(search, 10).filter((city) => !ids.includes(city.id)) : []),
    [search, ids],
  );

  function shift(minutes: number): void {
    setCursorAt((previous) => new Date((previous ?? nowAt).getTime() + minutes * 60_000));
  }

  function snap(stepMinutes: number, direction: 1 | -1): void {
    setCursorAt((previous) => snapToGrid(previous ?? nowAt, baseZone, stepMinutes, direction));
  }

  function reset(): void {
    setCursorAt(null);
    setNowAt(currentMinute());
  }

  /**
   * Bare arrow keys. They are only bound in the timeline: in the list they are
   * what moves the selection, and an action on them would leave the list
   * impossible to walk.
   */
  function scrubSection(): ReactNode {
    return (
      <ActionPanel.Section title="Scrub Time">
        <Action title={scrubTitle(-scrub)} icon={Icon.ArrowLeft} onAction={() => shift(-scrub)} shortcut={{ modifiers: [], key: "arrowLeft" }} />
        <Action title={scrubTitle(scrub)} icon={Icon.ArrowRight} onAction={() => shift(scrub)} shortcut={{ modifiers: [], key: "arrowRight" }} />
        <Action title={scrubTitle(-altScrub)} icon={Icon.ArrowLeftCircle} onAction={() => shift(-altScrub)} shortcut={{ modifiers: ["alt"], key: "arrowLeft" }} />
        <Action title={scrubTitle(altScrub)} icon={Icon.ArrowRightCircle} onAction={() => shift(altScrub)} shortcut={{ modifiers: ["alt"], key: "arrowRight" }} />
      </ActionPanel.Section>
    );
  }

  function snapSection(): ReactNode {
    return (
      <ActionPanel.Section title="Snap Time">
        <Action title={snapTitle(scrub, -1)} icon={Icon.ChevronLeft} onAction={() => snap(scrub, -1)} shortcut={{ modifiers: ["shift"], key: "arrowLeft" }} />
        <Action title={snapTitle(scrub, 1)} icon={Icon.ChevronRight} onAction={() => snap(scrub, 1)} shortcut={{ modifiers: ["shift"], key: "arrowRight" }} />
        <Action title={snapTitle(altScrub, -1)} icon={Icon.ChevronLeftSmall} onAction={() => snap(altScrub, -1)} shortcut={{ modifiers: ["shift", "alt"], key: "arrowLeft" }} />
        <Action title={snapTitle(altScrub, 1)} icon={Icon.ChevronRightSmall} onAction={() => snap(altScrub, 1)} shortcut={{ modifiers: ["shift", "alt"], key: "arrowRight" }} />
      </ActionPanel.Section>
    );
  }

  if (zones === null) return <Detail markdown="Loading…" />;

  if (view === "timeline") {
    const svg = generateTimelineSvg({
      cursorAt: at,
      nowAt,
      baseZone,
      baseCityId: base,
      localCityId: localId,
      zones: timelineZones,
      timeFormat,
      appearance: environment.appearance,
      sunTimes: sunTimesByCity,
    });
    const markdown = `![Timeline](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;

    return (
      <Detail
        markdown={markdown}
        actions={
          <ActionPanel>
            <Action title="Edit Cities" icon={Icon.Pencil} onAction={() => setView("list")} shortcut="edit" />
            <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["ctrl"], key: "n" }} />
            {scrubSection()}
            {snapSection()}
            {base && (
              <ActionPanel.Section title="Settings">
                <Action
                  title="Use System Timezone"
                  icon={Icon.ComputerChip}
                  onAction={() => void saveBase(null)}
                  shortcut={{ modifiers: ["ctrl"], key: "0" }}
                />
              </ActionPanel.Section>
            )}
            <ActionPanel.Section>
              <Action.CopyToClipboard title="Copy Base Time" content={at.toISOString()} shortcut="copy" />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  const cities = sortZones(ids.filter((id) => id !== baseId), at, order);
  const baseOffset = offsetMinutes(baseZone, at);
  const isSystemZone = !base;

  const shown = base ? [base, ...ids.filter((id) => id !== base)] : ids;

  return (
    <List
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
                  <Action title="Add and Set as Base" shortcut={{ modifiers: ["ctrl"], key: "a" }} icon={Icon.Pin} onAction={() => void addCity(city.id)} />
                  <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["ctrl"], key: "l" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {!search && (
        <List.Section title="Base Time">
          <List.Item
            icon={{ source: Icon.CircleFilled, tintColor: BAND_COLOR[getHourType(zoneParts(baseZone, at).hour)] }}
            title={`${zoneClock(baseZone, at, timeFormat).padStart(8)}  ${base ? cityOf(base) : baseZone}`}
            subtitle={`${formatGmtOffset(baseOffset)}${isSystemZone ? " • System timezone" : ""}`}
            accessories={[{ text: zoneDay(baseZone, at) }]}
            actions={
              <ActionPanel>
                <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["ctrl"], key: "l" }} />
                <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["ctrl"], key: "n" }} />
                {base && (
                  <Action title="Use System Timezone" icon={Icon.ComputerChip} onAction={() => void saveBase(null)} shortcut={{ modifiers: ["ctrl"], key: "0" }} />
                )}
                {scrubSection()}
                {snapSection()}
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy Base Time" content={at.toISOString()} shortcut="copy" />
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
              const clock = zoneClock(zone, at, timeFormat);

              return (
                <List.Item
                  key={id}
                  icon={{ source: Icon.Circle, tintColor: BAND_COLOR[getHourType(zoneParts(zone, at).hour)] }}
                  title={`${clock.padStart(8)}  ${cityOf(id)}`}
                  subtitle={formatGmtOffset(offset)}
                  accessories={[{ text: formatDelta(offset - baseOffset, "clock") }, { text: zoneDay(zone, at) }]}
                  actions={
                    <ActionPanel>
                      <Action title="Set as Base" shortcut={{ modifiers: ["ctrl"], key: "i" }} icon={Icon.Pin} onAction={() => void saveBase(id)} />
                      <Action
                        title="Remove City"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        onAction={() => void saveZones(shown.filter((other) => other !== id))}
                        shortcut="remove"
                      />
                      <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["ctrl"], key: "n" }} />
                      <Action title="Timeline" icon={Icon.Calendar} onAction={() => setView("timeline")} shortcut={{ modifiers: ["ctrl"], key: "l" }} />
                      {scrubSection()}
                      {snapSection()}
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
