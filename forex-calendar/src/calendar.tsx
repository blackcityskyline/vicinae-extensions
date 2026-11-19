import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";

import { readFilters, writeFilters } from "~/api/filters-store";
import { loadSource, type Loaded } from "~/api/load";
import type { CalendarEvent, Impact } from "~/api/feed";
import { monthUrl } from "~/api/ff-month";
import { FilterActions, RangeAction } from "~/components/filter-forms";
import { describeFilters, isFiltered, type Filters } from "~/utils/filters";
import { groupByDay, isMonthPeriod, selectEvents, sourceOf, type Period, type Range, type Source } from "~/utils/select";

const CALENDAR_URL = "https://www.forexfactory.com/calendar";

const PERIODS: Array<{ value: Period; title: string }> = [
  { value: "today", title: "Today" },
  { value: "tomorrow", title: "Tomorrow" },
  { value: "upcoming", title: "Upcoming" },
  { value: "week", title: "This Week" },
  { value: "nextweek", title: "Next Week" },
  { value: "yesterday", title: "Yesterday" },
  { value: "month", title: "This Month" },
  { value: "nextmonth", title: "Next Month" },
  { value: "lastmonth", title: "Last Month" },
  { value: "range", title: "Custom Range" },
];

/** Periods that span days get a section per day; the single-day ones are one list. */
const MULTI_DAY: Period[] = ["upcoming", "week", "nextweek", "month", "nextmonth", "lastmonth", "range"];

const IMPACT_COLOR: Record<Impact, Color> = {
  High: Color.Red,
  Medium: Color.Orange,
  Low: Color.Yellow,
  Holiday: Color.SecondaryText,
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function clock(epoch: number): string {
  return timeFormat.format(new Date(epoch));
}

/** The page's own word for a time that is not a clock, otherwise the clock. */
const when = (event: CalendarEvent): string => event.timeLabel ?? clock(event.at);

function summary(event: CalendarEvent): string {
  const figures = [
    event.actual && `actual ${event.actual}`,
    event.forecast && `forecast ${event.forecast}`,
    event.previous && `previous ${event.previous}`,
  ].filter(Boolean);
  return [`${when(event)} ${dayFormat.format(new Date(event.at))}`, event.currency, event.title, ...figures].join(" · ");
}

/**
 * ForexFactory's economic calendar. The day and week periods come from Fair Economy's public weekly
 * feeds; the month periods and a custom range of days come from ForexFactory's own month pages, so any
 * date in the past or the future can be shown.
 *
 * Nothing runs while the window is closed and no timer runs while it is open: a source is read when
 * its period is shown, and again only when asked.
 */
export default function Calendar() {
  const [period, setPeriod] = useState<Period>("today");
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [range, setRange] = useState<Range>();
  const [feeds, setFeeds] = useState<Record<string, Loaded>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isLoading, setIsLoading] = useState(true);

  // The source is a new object on every render; its key is what says whether it changed.
  const source = sourceOf(period, new Date(), range);
  const sourceKey = source.key;

  const load = useCallback(async (target: Source, force: boolean) => {
    setIsLoading(true);
    try {
      const result = await loadSource(target, force);
      setFeeds((previous) => ({ ...previous, [target.key]: result }));
      setErrors((previous) => ({ ...previous, [target.key]: undefined }));
    } catch (cause) {
      setErrors((previous) => ({ ...previous, [target.key]: (cause as Error).message }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(sourceOf(period, new Date(), range), false);
    // `sourceKey` stands for the period and the range together.
  }, [load, sourceKey]);

  const refresh = useCallback(() => void load(sourceOf(period, new Date(), range), true), [load, period, range]);

  const applyFilters = useCallback((next: Filters) => {
    writeFilters(next);
    setFilters(next);
  }, []);

  const loaded = feeds[sourceKey];
  const error = errors[sourceKey];
  const calendarUrl = source.kind === "months" && source.months[0] ? monthUrl(source.months[0]) : CALENDAR_URL;

  // Every currency the feeds have shown, plus the ones already chosen, so a choice is never lost.
  const available = useMemo(() => {
    const codes = new Set(filters.currencies);
    for (const feed of Object.values(feeds)) for (const event of feed.events) codes.add(event.currency);
    codes.delete("All");
    return [...codes].sort();
  }, [feeds, filters.currencies]);

  const dropdown = (
    <List.Dropdown tooltip="Period" value={period} onChange={(value) => setPeriod(value as Period)}>
      {PERIODS.map((entry) => (
        <List.Dropdown.Item key={entry.value} title={entry.title} value={entry.value} />
      ))}
    </List.Dropdown>
  );

  const filterActions = (
    <>
      {period === "range" ? <RangeAction range={range} onApply={setRange} /> : null}
      <FilterActions available={available} filters={filters} onApply={applyFilters} />
    </>
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
  const events = selectEvents(loaded.events, { period, now, filters, range });
  const groups = MULTI_DAY.includes(period) ? groupByDay(events) : [{ key: period, events }];

  return (
    <List isLoading={isLoading} navigationTitle="Forex Calendar" searchBarPlaceholder="Search events, currencies, impact" searchBarAccessory={dropdown}>
      {loaded.failure || isFiltered(filters) ? (
        <List.Section title="Status">
          {loaded.failure ? (
            <List.Item
              icon={Icon.Exclamationmark}
              title="Showing the saved copy"
              subtitle={`${loaded.failure} (saved at ${clock(loaded.fetchedAt)})`}
              actions={
                <ActionPanel>
                  <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
                  {filterActions}
                </ActionPanel>
              }
            />
          ) : null}
          {isFiltered(filters) ? (
            <List.Item
              icon={Icon.Filter}
              title="Filters on"
              subtitle={describeFilters(filters)}
              actions={<ActionPanel>{filterActions}</ActionPanel>}
            />
          ) : null}
        </List.Section>
      ) : null}

      {groups.map((group) => (
        <List.Section
          key={group.key}
          title={group.events[0] && MULTI_DAY.includes(period) ? dayFormat.format(new Date(group.events[0].at)) : undefined}
        >
          {group.events.map((event) => (
            <EventRow
              key={`${event.at}-${event.currency}-${event.title}`}
              event={event}
              now={now.getTime()}
              onRefresh={refresh}
              filterActions={filterActions}
              calendarUrl={calendarUrl}
            />
          ))}
        </List.Section>
      ))}

      <List.EmptyView
        icon={Icon.Calendar}
        title="No events"
        description={
          period === "range" && !range
            ? "Choose the first and last day to show with Choose Dates in the actions below."
            : isFiltered(filters)
              ? "Nothing in this period matches your filters. Change or clear them with the actions below."
              : isMonthPeriod(period)
                ? "ForexFactory lists no events for this period."
                : "The weekly feed has no events in this period."
        }
        actions={
          <ActionPanel>
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={refresh} />
            {filterActions}
          </ActionPanel>
        }
      />
    </List>
  );
}

function EventRow({
  event,
  now,
  onRefresh,
  filterActions,
  calendarUrl,
}: {
  event: CalendarEvent;
  now: number;
  onRefresh: () => void;
  filterActions: React.ReactNode;
  calendarUrl: string;
}) {
  const past = event.at < now;
  const accessories: List.Item.Accessory[] = [];
  if (event.actual) accessories.push({ text: `A ${event.actual}`, tooltip: "Actual" });
  if (event.forecast) accessories.push({ text: `F ${event.forecast}`, tooltip: "Forecast" });
  if (event.previous) accessories.push({ text: `P ${event.previous}`, tooltip: "Previous" });
  accessories.push({ text: when(event), tooltip: past ? "Already happened" : undefined });

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
          <Action.OpenInBrowser title="Open Calendar in Browser" url={calendarUrl} shortcut="open" />
          {filterActions}
          <ActionPanel.Section>
            <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut="refresh" onAction={onRefresh} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
