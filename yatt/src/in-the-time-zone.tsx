import {
  Action,
  ActionPanel,
  Detail,
  environment,
  Icon,
  Keyboard,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { dayNumber, wallParts, zoneOffset } from "./core/time";
import type { Location } from "./core/types";
import { coordsOf, type Coords } from "./lib/coords";
import { getPrefs, localZone } from "./lib/prefs";
import { useLocations } from "./lib/storage";
import {
  generateTimelineParts,
  TIMELINE_PART_HEIGHT,
  TIMELINE_WIDTH,
  type TimelineRow,
} from "./lib/timeline-svg";

/** Opens another command of this extension; Raycast refuses when it is disabled, which the toast explains. */
async function openCommand(name: string): Promise<void> {
  try {
    await launchCommand({ name, type: LaunchType.UserInitiated });
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Could not open the command", message: String(e) });
  }
}

/** Truncated to the minute, so the clocks re-render once a minute, not per tick. */
function currentMinute(): number {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

/**
 * The instant of the nearest multiple of `stepMinutes` on the zone's local clock, strictly after (direction 1)
 * or before (direction -1) `at`.
 *
 * Around a daylight saving change the nearest grid point is not always the next one in clock order: in the
 * repeated hour an earlier clock time can still lie ahead, and skipped clock times do not exist. So grid
 * points within three hours on both sides are checked, and the nearest valid one wins.
 */
function snapToGrid(at: number, tz: string, stepMinutes: number, direction: 1 | -1): number {
  const parts = wallParts(at, tz);
  const minuteOfDay = parts.h * 60 + parts.min + (at % 60_000) / 60_000;
  const first = direction > 0 ? Math.floor(minuteOfDay / stepMinutes) : Math.ceil(minuteOfDay / stepMinutes);
  const span = Math.ceil(180 / stepMinutes);

  let nearest: number | undefined;
  for (let i = -span; i <= span; i++) {
    for (const occurrence of localOccurrences(tz, dayNumber(at, tz), (first + i * direction) * stepMinutes)) {
      const distance = direction * (occurrence - at);
      if (distance > 0 && (!nearest || distance < nearest)) nearest = distance;
    }
  }
  return at + (nearest ?? direction * stepMinutes * 60_000);
}

/**
 * The instants at which the zone's clock shows the given minutes after the start of the day: usually one, two
 * in the hour repeated when daylight saving time ends, and none in the hour it skips.
 */
function localOccurrences(tz: string, day: number, minutes: number): number[] {
  const days = Math.floor(minutes / 1440);
  const localMinutes = minutes - days * 1440;
  // Wall-clock milliseconds since the epoch, before an offset is subtracted.
  const wallMs = (day + days) * 86_400_000 + localMinutes * 60_000;
  const offsets = new Set([
    zoneOffset(wallMs - 6 * 3_600_000, tz),
    zoneOffset(wallMs + 6 * 3_600_000, tz),
  ]);
  return [...offsets]
    .map((offset) => wallMs - offset * 60_000)
    .filter((instant) => {
      const parts = wallParts(instant, tz);
      return dayNumber(instant, tz) === day + days && parts.h * 60 + parts.min === localMinutes;
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

export default function InTheTimezone() {
  const prefs = useMemo(getPrefs, []);
  const local = useMemo(localZone, []);
  const { locations, isLoading, error } = useLocations();
  const [nowAt, setNowAt] = useState(currentMinute);
  // null while the cursor follows the current time; set once the user scrubs away from it
  const [cursorAt, setCursorAt] = useState<number | null>(null);

  useEffect(() => {
    if (error) void showToast({ style: Toast.Style.Failure, title: "Could not load locations", message: error });
  }, [error]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = currentMinute();
      setNowAt((previous) => (previous === next ? previous : next));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const configured = useMemo(() => locations ?? [], [locations]);

  // The home location is the base: the timeline's cursor column, the offset every delta is measured against.
  // Without one the machine's own zone is the base, and its row joins the timeline.
  const localRow: Location | undefined = useMemo(
    () =>
      !configured.some((l) => l.tz === local)
        ? {
            id: "local",
            kind: "zone",
            // The zone's own city reads better than another "Local" next to the badge of the same name.
            label: (local.split("/").pop() ?? local).replace(/_/g, " "),
            tz: local,
            aliases: ["local", "here"],
          }
        : undefined,
    [configured, local],
  );
  const base = useMemo(
    () =>
      configured.find((l) => l.isHome) ??
      configured.find((l) => l.tz === local) ??
      localRow ?? { id: "local", kind: "zone", label: "Local", tz: local, aliases: [] },
    [configured, localRow, local],
  );
  const at = cursorAt ?? nowAt;
  /** The row that wears the Local badge: the base's row when it is in this machine's zone, else the extra one. */
  const localId = (configured.find((l) => l.tz === local) ?? localRow)?.id;

  const rows: TimelineRow[] = useMemo(() => {
    const list = [...configured];
    if (prefs.showLocalRow && localRow && !list.some((l) => l.id === base.id)) list.push(localRow);
    const indexed = list.map((location, i) => ({ location, i }));
    if (prefs.sortOrder !== "manual") {
      const direction = prefs.sortOrder === "offsetDesc" ? -1 : 1;
      indexed.sort(
        (a, b) =>
          direction * (zoneOffset(at, a.location.tz) - zoneOffset(at, b.location.tz)) || a.i - b.i,
      );
    }
    return indexed.map(({ location }) => {
      const coords: Coords | undefined = coordsOf(location.label, location.tz);
      return {
        label: location.label,
        tz: location.tz,
        coords,
        business: location.businessHours ?? prefs.business,
        shoulder: prefs.shoulder,
        isBase: location.id === base.id,
        isLocal: location.id === localId,
      };
    });
  }, [configured, localRow, base.id, prefs, at, local, localId]);

  const markdown = useMemo(() => {
    const images = generateTimelineParts({
      cursorAt: at,
      nowAt,
      baseTz: base.tz,
      rows,
      timeFormat: prefs.timeFormat,
      dark: environment.appearance === "dark",
      colors: prefs.stripColors,
    });
    // Each image carries its own box: `raycast-height` keeps Vicinae from putting it in the default 200 px
    // tall frame, which is taller than the 174 px these are drawn for. The comma after the fragment is the
    // one DataUri splits on, so the query stays out of the base64 payload.
    return images
      .map((image) => {
        const data = `data:image/svg+xml;base64?raycast-height=${TIMELINE_PART_HEIGHT}&raycast-width=${TIMELINE_WIDTH}#x,${Buffer.from(image).toString("base64")}`;
        return `![](${data})`;
      })
      .join("\n\n");
  }, [at, nowAt, base.tz, rows, prefs]);

  const scrub = prefs.scrubMinutes;
  const altScrub = prefs.optionScrubMinutes;

  function shift(minutes: number): void {
    setCursorAt((previous) => (previous ?? nowAt) + minutes * 60_000);
  }

  function snap(stepMinutes: number, direction: 1 | -1): void {
    setCursorAt((previous) => snapToGrid(previous ?? nowAt, base.tz, stepMinutes, direction));
  }

  function reset(): void {
    setCursorAt(null);
    setNowAt(currentMinute());
  }

  function scrubSection() {
    return (
      <ActionPanel.Section title="Scrub Time">
        <Action title={scrubTitle(-scrub)} icon={Icon.ArrowLeft} onAction={() => shift(-scrub)} shortcut={{ modifiers: [], key: "arrowLeft" }} />
        <Action title={scrubTitle(scrub)} icon={Icon.ArrowRight} onAction={() => shift(scrub)} shortcut={{ modifiers: [], key: "arrowRight" }} />
        <Action title={scrubTitle(-altScrub)} icon={Icon.ArrowLeft} onAction={() => shift(-altScrub)} shortcut={{ modifiers: ["opt"], key: "arrowLeft" }} />
        <Action title={scrubTitle(altScrub)} icon={Icon.ArrowRight} onAction={() => shift(altScrub)} shortcut={{ modifiers: ["opt"], key: "arrowRight" }} />
      </ActionPanel.Section>
    );
  }

  function snapSection() {
    return (
      <ActionPanel.Section title="Snap Time">
        <Action title={snapTitle(scrub, -1)} icon={Icon.ChevronLeft} onAction={() => snap(scrub, -1)} shortcut={{ modifiers: ["shift"], key: "arrowLeft" }} />
        <Action title={snapTitle(scrub, 1)} icon={Icon.ChevronRight} onAction={() => snap(scrub, 1)} shortcut={{ modifiers: ["shift"], key: "arrowRight" }} />
        <Action title={snapTitle(altScrub, -1)} icon={Icon.ChevronLeft} onAction={() => snap(altScrub, -1)} shortcut={{ modifiers: ["shift", "opt"], key: "arrowLeft" }} />
        <Action title={snapTitle(altScrub, 1)} icon={Icon.ChevronRight} onAction={() => snap(altScrub, 1)} shortcut={{ modifiers: ["shift", "opt"], key: "arrowRight" }} />
      </ActionPanel.Section>
    );
  }

  const actions = (
    <ActionPanel>
      <ActionPanel.Section>
        <Action title="Manage Locations" icon={Icon.BulletPoints} onAction={() => openCommand("manage-locations")} shortcut={{ modifiers: ["cmd", "shift"], key: "m" }} />
        <Action title="Reset to Now" icon={Icon.Clock} onAction={reset} shortcut={{ modifiers: ["ctrl"], key: "n" }} />
      </ActionPanel.Section>
      {scrubSection()}
      {snapSection()}
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Base Time" content={new Date(at).toISOString()} shortcut={Keyboard.Shortcut.Common.Copy} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  if (!isLoading && rows.length === 0) {
    return (
      <Detail
        markdown={`# No locations\n\nAdd the cities you care about in **Manage Locations**; the timeline shows them all at once.`}
        actions={actions}
      />
    );
  }

  return <Detail isLoading={isLoading} markdown={markdown} actions={actions} />;
}
