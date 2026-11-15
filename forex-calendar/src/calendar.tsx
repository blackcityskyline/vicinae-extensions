import { Action, ActionPanel, Color, Icon, List, getPreferenceValues, openCommandPreferences } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { loadFeed, type Loaded } from "~/api/load";
import type { CalendarEvent, Impact } from "~/api/feed";
import { groupByDay, parseCurrencies, selectEvents, type Period } from "~/utils/select";

const CALENDAR_URL = "https://www.forexfactory.com/calendar";

const PERIODS: Array<{ value: Period; title: string }> = [
  { value: "today", title: "Today" },
  { value: "tomorrow", title: "Tomorrow" },
  { value: "upcoming", title: "Upcoming" },
  { value: "week", title: "This Week" },
  { value: "yesterday", title: "Yesterday" },
];

const IMPACT_COLOR: Record<Impact, Color> = {
  High: Color.Red,
  Medium: Color.Orange,
  Low: Color.Yellow,
  Holiday: Color.SecondaryText,
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

function clock(epoch: number): string {
  return timeFormat.format(new Date(epoch));
}

function summary(event: CalendarEvent): string {
  const figures = [event.forecast && `forecast ${event.forecast}`, event.previous && `previous ${event.previous}`].filter(Boolean);
  return [`${clock(event.at)} ${dayFormat.format(new Date(event.at))}`, event.currency, event.title, ...figures].join(" · ");
}

/**
 * ForexFactory's economic calendar for the current week, read from Fair Economy's public feed.
 *
 * Nothing runs while the window is closed and no timer runs while it is open: the feed is read on
 * open, and again only when asked.
 */
export default function Calendar() {
  const { minImpact, currencies } = getPreferenceValues<Preferences.Calendar>();
  const codes = parseCurrencies(currencies);

  const [period, setPeriod] = useState<Period>("today");
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (force: boolean) => {
    setIsLoading(true);
    try {
      setLoaded(await loadFeed(force));
      setError(undefined);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => void load(true), [load]);

  const dropdown = (
    <List.Dropdown tooltip="Period" value={period} onChange={(value) => setPeriod(value as Period)}>
      {PERIODS.map((entry) => (
        <List.Dropdown.Item key={entry.value} title={entry.title} value={entry.value} />
      ))}
    </List.Dropdown>
  );

  if (!loaded) {
    return (
      <List isLoading={isLoading} navigationTitle="Forex Calendar" searchBarPlaceholder="Search events" searchBarAccessory={dropdown}>
        {error ? (
          <List.EmptyView
            icon={Icon.Exclamationmark}
            title="Could not load the calendar"
            description={error}
            actions={
              <ActionPanel>
                <Action title="Try Again" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
              </ActionPanel>
            }
          />
        ) : null}
      </List>
    );
  }

  const now = new Date();
  const events = selectEvents(loaded.events, { period, now, minImpact: minImpact ?? "all", currencies: codes });
  const groups = period === "today" || period === "tomorrow" || period === "yesterday" ? [{ key: period, events }] : groupByDay(events);

  return (
    <List isLoading={isLoading} navigationTitle="Forex Calendar" searchBarPlaceholder="Search events, currencies, impact" searchBarAccessory={dropdown}>
      {loaded.failure ? (
        <List.Section title="Status">
          <List.Item
            icon={Icon.Exclamationmark}
            title="Showing the saved copy"
            subtitle={`${loaded.failure} (saved at ${clock(loaded.fetchedAt)})`}
            actions={<RowActions onRefresh={refresh} />}
          />
        </List.Section>
      ) : null}

      {groups.map((group) => (
        <List.Section
          key={group.key}
          title={group.events[0] && (period === "upcoming" || period === "week") ? dayFormat.format(new Date(group.events[0].at)) : undefined}
        >
          {group.events.map((event) => (
            <EventRow key={`${event.at}-${event.currency}-${event.title}`} event={event} now={now.getTime()} onRefresh={refresh} />
          ))}
        </List.Section>
      ))}

      <List.EmptyView
        icon={Icon.Calendar}
        title="No events"
        description="Nothing matches this period with your impact and currency preferences. The feed only holds the current week; change the filters in the command preferences."
        actions={
          <ActionPanel>
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
            <Action title="Open Preferences" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openCommandPreferences} />
          </ActionPanel>
        }
      />
    </List>
  );
}

function EventRow({ event, now, onRefresh }: { event: CalendarEvent; now: number; onRefresh: () => void }) {
  const past = event.at < now;
  const accessories: List.Item.Accessory[] = [];
  if (event.forecast) accessories.push({ text: `F ${event.forecast}`, tooltip: "Forecast" });
  if (event.previous) accessories.push({ text: `P ${event.previous}`, tooltip: "Previous" });
  accessories.push({ text: clock(event.at), tooltip: past ? "Already happened" : undefined });

  return (
    <List.Item
      icon={{ source: Icon.CircleFilled, tintColor: IMPACT_COLOR[event.impact] }}
      title={event.title}
      subtitle={event.currency}
      keywords={[event.currency, event.impact, `${event.impact} impact`]}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Event" content={summary(event)} shortcut="copy" />
          <Action.OpenInBrowser title="Open Calendar in Browser" url={CALENDAR_URL} shortcut="open" />
          <ActionPanel.Section>
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function RowActions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
    </ActionPanel>
  );
}
