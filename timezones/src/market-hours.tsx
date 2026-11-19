import {
  Action,
  ActionPanel,
  Detail,
  environment,
  getPreferenceValues,
  Icon,
  Keyboard,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { formatTime } from "./core/format";
import { snapToGrid, zoneOffset } from "./core/time";
import type { Location } from "./core/types";
import { isOpenAt, regionFor } from "./lib/markets";
import { getPrefs, localZone } from "./lib/prefs";
import { firstStartsFrom, SESSION_COLOR, spansBetween } from "./lib/sessions";
import { loadSessions, sessionsFile } from "./lib/sessions-store";
import { useLocations } from "./lib/storage";
import {
  generateTimelineParts,
  TIMELINE_PART_HEIGHT,
  TIMELINE_WIDTH,
  timelineWindow,
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

function scrubTitle(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return absolute === 60 ? `${sign}1 Hour` : `${sign}${absolute} Minutes`;
}

function snapTitle(minutes: number, direction: 1 | -1): string {
  return `Snap to ${direction > 0 ? "Next" : "Previous"} ${minutes === 60 ? "Hour" : `${minutes} Minutes`}`;
}

/** Session names are read from the user's own file, so the legend says where New York's clock stands for each. */
const LEGEND_ZONE = "America/New_York";

export default function MarketHours() {
  const prefs = useMemo(getPrefs, []);
  const { sessionMode } = getPreferenceValues<Preferences.MarketHours>();
  const custom = sessionMode === "custom";
  const [reloads, setReloads] = useState(0);
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
    return indexed.map(({ location }) => ({
      label: location.label,
      tz: location.tz,
      isBase: location.id === base.id,
      isLocal: location.id === localId,
    }));
  }, [configured, localRow, base.id, prefs, at, local]);

  // Read again with every minute tick and on Reload, so an edit to the custom file shows up without reopening.
  const loaded = useMemo(() => loadSessions(custom ? "custom" : "default"), [custom, nowAt, reloads]);

  const markdown = useMemo(() => {
    if ("error" in loaded) return "";
    const window = timelineWindow(at, base.tz);
    const images = generateTimelineParts({
      cursorAt: at,
      nowAt,
      baseTz: base.tz,
      rows,
      timeFormat: prefs.timeFormat,
      dark: environment.appearance === "dark",
      colors: prefs.stripColors,
      // A zone's cells take its region's colour while its forex session runs, grey otherwise.
      shade: (instant, tz) => {
        const region = regionFor(tz);
        return region && isOpenAt(region.session, instant) ? "business" : "off";
      },
      rowColor: (tz) => SESSION_COLOR[regionFor(tz)?.session.id ?? ""],
      markers: spansBetween(loaded.sessions, window.from, window.to).map(({ at, label, color, end }) => ({ at, label, color, end })),
      markerLegend: {
        caption: "In New York:",
        items: firstStartsFrom(loaded.sessions, window.from).map((start) => ({
          label: start.label,
          color: start.color,
          note: formatTime(start.at, LEGEND_ZONE, prefs.timeFormat),
        })),
      },
      legend: { business: "In session", off: "Closed" },
      showSun: false,
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
  }, [at, nowAt, base.tz, rows, prefs, loaded]);

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
      {custom ? (
        <ActionPanel.Section title="Sessions">
          <Action.Open title="Edit Custom Sessions" icon={Icon.Pencil} target={sessionsFile()} shortcut={Keyboard.Shortcut.Common.Edit} />
          <Action title="Reload Sessions" icon={Icon.ArrowClockwise} onAction={() => setReloads((n) => n + 1)} shortcut={Keyboard.Shortcut.Common.Refresh} />
        </ActionPanel.Section>
      ) : null}
      {scrubSection()}
      {snapSection()}
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Base Time" content={new Date(at).toISOString()} shortcut={Keyboard.Shortcut.Common.Copy} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  if ("error" in loaded) {
    return (
      <Detail
        markdown={`# The sessions file has a problem\n\n${loaded.error}\n\nFix it with **Edit Custom Sessions**, then **Reload Sessions**, or set Sessions to Default in the command's preferences.`}
        actions={actions}
      />
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <Detail
        markdown={`# No locations\n\nAdd the cities you care about in **Manage Locations**; the timeline shows their market hours at once.`}
        actions={actions}
      />
    );
  }

  return <Detail isLoading={isLoading} markdown={markdown} actions={actions} />;
}
