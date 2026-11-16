import { Color, Icon, List, environment } from "@raycast/api";
import { useMemo, useRef, useState } from "react";
import { Setup } from "./components/Onboarding";
import { RadarView } from "./components/RadarView";
import { TodayView } from "./components/TodayView";
import { WeatherActions } from "./components/WeatherActions";
import { useLiveClock } from "./hooks/useLiveClock";
import { useWeatherData } from "./hooks/useWeatherData";
import { WeatherSettings, useWeatherSettings } from "./hooks/useWeatherSettings";
import {
  AirQuality,
  Forecast,
  GeoResult,
  NwsAlert,
  degreesToCompass,
  fmt,
  formatPlace,
  formatPrecip,
  formatSnow,
  pollenSummary,
  usAqiInfo,
} from "./lib/api";
import { moonInfo, formatClock } from "./lib/astro";
import { WEEKDAYS, dayHero, dayName, isoToDate, nowHero, timeOf, yesterdayComparison } from "./lib/build";
import { iconFor, labelFor, tagColorFor } from "./lib/conditions";
import { buildDayShareSvg, buildNowShareSvg } from "./lib/share";
import { LIST_IMAGE_H, LIST_IMAGE_W, renderHero, renderStatsCard, svgToMarkdown, type Stat } from "./lib/svg";
import { onWindow } from "./lib/themes";
import { escapeMarkdown } from "./lib/text";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The two cards of a row's detail pane share this frame; see `LIST_IMAGE_W`. */
const LIST_FRAME = { width: LIST_IMAGE_W, height: LIST_IMAGE_H };

export default function Command() {
  const settings = useWeatherSettings();
  const { locations, active, units } = settings;
  // Controlled so leftover text from the setup screen's city search (which
  // shares this view's search bar) doesn't filter the forecast list.
  const [searchText, setSearchText] = useState("");

  const { forecast, airQuality, alerts, isLoading, error, revalidate } = useWeatherData(
    active,
    units,
    settings.forecastDays,
  );
  const tick = useLiveClock(revalidate);

  if (locations.length === 0 || !active) {
    if (settings.isLoading) return <List isLoading />;
    return <Setup settings={settings} />;
  }

  if (settings.view === "today") {
    return (
      <TodayView
        settings={settings}
        place={active}
        forecast={forecast}
        airQuality={airQuality}
        isLoading={isLoading}
        error={error}
        tick={tick}
        refresh={revalidate}
      />
    );
  }

  if (settings.view === "radar") {
    return (
      <RadarView settings={settings} place={active} forecast={forecast} isLoading={isLoading} refresh={revalidate} />
    );
  }

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={formatPlace(active)}
      searchBarAccessory={locations.length > 1 ? <LocationDropdown settings={settings} /> : undefined}
    >
      {!forecast && isLoading && (
        <List.EmptyView icon={Icon.CloudSun} title="Fetching the forecast…" description={formatPlace(active)} />
      )}
      {!forecast && !isLoading && (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Couldn't load the forecast"
          description={error?.message ?? "Check your connection and try again"}
          actions={<WeatherActions settings={settings} refresh={revalidate} />}
        />
      )}
      {forecast && (
        <>
          {alerts.length > 0 && (
            <List.Section title="Severe Weather Alerts">
              {alerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} settings={settings} refresh={revalidate} />
              ))}
            </List.Section>
          )}
          <List.Section title="Right Now">
            <NowItem
              forecast={forecast}
              airQuality={airQuality}
              place={active}
              settings={settings}
              refresh={revalidate}
              tick={tick}
            />
          </List.Section>
          <List.Section title={`${settings.forecastDays}-Day Forecast`}>
            {forecast.daily.time.map((_, i) => (
              <DayItem
                key={forecast.daily.time[i]}
                forecast={forecast}
                dayIndex={i}
                place={active}
                settings={settings}
                refresh={revalidate}
              />
            ))}
          </List.Section>
        </>
      )}
    </List>
  );
}

/**
 * Location picker in the search bar. Raycast calls `onChange` once on mount
 * with the natively preselected item, which is the first one, not `value`.
 * This dropdown mounts exactly when the second location is added, so acting
 * on that call would switch straight back to the first location.
 */
function LocationDropdown(props: { settings: WeatherSettings }) {
  const { locations, active, setActiveId } = props.settings;
  const mounted = useRef(false);
  if (!active) return null;
  return (
    <List.Dropdown
      tooltip="Location"
      value={String(active.id)}
      onChange={(v) => {
        if (!mounted.current) {
          mounted.current = true;
          return;
        }
        const id = Number(v);
        // Programmatic `value` changes echo back through onChange; only user picks should act.
        if (id !== active.id) setActiveId(id);
      }}
    >
      {locations.map((l) => (
        <List.Dropdown.Item key={l.id} title={formatPlace(l)} value={String(l.id)} icon={Icon.Pin} />
      ))}
    </List.Dropdown>
  );
}

function AlertItem(props: { alert: NwsAlert; settings: WeatherSettings; refresh: () => void }) {
  const p = props.alert.properties;
  const severe = p.severity === "Extreme" || p.severity === "Severe";
  // NWS text is hard-wrapped prose with stray *, # and _; render it literally.
  const prose = (text: string) => escapeMarkdown(text).replace(/\n/g, "  \n");
  const markdown = [
    `## ${escapeMarkdown(p.event)}`,
    p.headline ? `**${escapeMarkdown(p.headline)}**` : "",
    prose(p.description),
    p.instruction
      ? prose(p.instruction)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const ends = p.ends ?? p.expires;

  return (
    <List.Item
      title={p.event}
      icon={{ source: Icon.ExclamationMark, tintColor: severe ? Color.Red : Color.Orange }}
      accessories={[{ tag: { value: p.severity, color: severe ? Color.Red : Color.Orange } }]}
      detail={
        <List.Item.Detail
          markdown={markdown}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.TagList title="Severity">
                <List.Item.Detail.Metadata.TagList.Item text={p.severity} color={severe ? Color.Red : Color.Orange} />
              </List.Item.Detail.Metadata.TagList>
              <List.Item.Detail.Metadata.Label title="Area" text={p.areaDesc} />
              {ends && <List.Item.Detail.Metadata.Label title="Ends" text={ends.slice(0, 16).replace("T", " ")} />}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <WeatherActions
          settings={props.settings}
          refresh={props.refresh}
          summary={`${p.event}: ${p.headline ?? p.areaDesc}`}
        />
      }
    />
  );
}

function NowItem(props: {
  forecast: Forecast;
  airQuality: AirQuality | undefined;
  place: GeoResult;
  settings: WeatherSettings;
  refresh: () => void;
  /** Minute counter; re-renders the hero so its clock line stays live. */
  tick: number;
}) {
  const { forecast, airQuality, place, settings } = props;
  const cur = forecast.current;
  const label = labelFor(cur.weather_code);
  const { unitSymbol, windUnit, theme } = settings;

  // The figures live in the picture, not a metadata table: the table takes 40% of
  // the pane, and the card needs that height to fill it.
  const markdown = useMemo(() => {
    const opts = nowHero(forecast, place, theme, unitSymbol, environment.appearance);
    const style = onWindow(opts.style, environment.appearance);
    const vsYesterday = yesterdayComparison(forecast);
    const aqi = airQuality?.current.us_aqi;
    const pollen = pollenSummary(airQuality);
    const moon = moonInfo(new Date(), place.latitude, place.longitude, forecast.utc_offset_seconds);
    const stats: Stat[] = [
      { label: "Humidity", value: fmt(cur.relative_humidity_2m, "%") },
      { label: "Wind", value: `${fmt(cur.wind_speed_10m)} ${windUnit} ${degreesToCompass(cur.wind_direction_10m)}` },
      { label: "Gusts", value: fmt(cur.wind_gusts_10m, ` ${windUnit}`) },
      { label: "Pressure", value: fmt(cur.surface_pressure, " hPa") },
      { label: "Cloud Cover", value: fmt(cur.cloud_cover, "%") },
      { label: "UV Index", value: fmt(cur.uv_index) },
      ...(aqi != null ? [{ label: "Air Quality", value: `${Math.round(aqi)} · ${usAqiInfo(aqi).label}` }] : []),
      ...(pollen ? [{ label: "Pollen", value: pollen }] : []),
      ...(vsYesterday ? [{ label: "Vs Yesterday", value: vsYesterday.replace(/ (than|as) yesterday$/, "") }] : []),
      { label: "Sunrise", value: timeOf(forecast.daily.sunrise[0]) },
      { label: "Sunset", value: timeOf(forecast.daily.sunset[0]) },
      { label: "Moon", value: `${Math.round(moon.illumination * 100)}%` },
      { label: "Phase", value: moon.phaseName },
      ...(moon.moonrise || moon.moonset
        ? [
            {
              label: "Moonrise",
              value: `${moon.moonrise ? formatClock(moon.moonrise, forecast.utc_offset_seconds) : "—"} / ${moon.moonset ? formatClock(moon.moonset, forecast.utc_offset_seconds) : "—"}`,
            },
          ]
        : []),
    ];
    return [
      svgToMarkdown(renderHero({ ...opts, style }), "", LIST_FRAME),
      svgToMarkdown(renderStatsCard(stats, style), "", LIST_FRAME),
    ].join("\n\n");
  }, [forecast, airQuality, place, unitSymbol, windUnit, theme, props.tick]);

  const summary = `${formatPlace(place)}: ${Math.round(cur.temperature_2m)}°${unitSymbol}, ${label}, feels like ${fmt(cur.apparent_temperature, "°")}`;

  return (
    <List.Item
      title="Now"
      keywords={["current", "conditions"]}
      subtitle={label}
      icon={{
        source: iconFor(cur.weather_code, cur.is_day === 1),
        tintColor: tagColorFor(cur.weather_code, cur.is_day === 1),
      }}
      accessories={[{ text: `${Math.round(cur.temperature_2m)}°${unitSymbol}` }]}
      detail={<List.Item.Detail markdown={markdown} />}
      actions={
        <WeatherActions
          settings={settings}
          refresh={props.refresh}
          summary={summary}
          shareSvg={() => buildNowShareSvg(forecast, place, theme, unitSymbol, windUnit)}
        />
      }
    />
  );
}

function DayItem(props: {
  forecast: Forecast;
  dayIndex: number;
  place: GeoResult;
  settings: WeatherSettings;
  refresh: () => void;
}) {
  const { forecast, dayIndex: d, place, settings } = props;
  const daily = forecast.daily;
  const code = daily.weather_code[d];
  const label = labelFor(code);
  const high = daily.temperature_2m_max[d];
  const low = daily.temperature_2m_min[d];
  // null past the model horizon on 16-day forecasts; shown as "—" rather than 0%.
  const rain = daily.precipitation_probability_max[d] as number | null;
  const { unitSymbol, windUnit, theme } = settings;

  const name = dayName(forecast, d);

  const precipSum = daily.precipitation_sum[d] ?? 0;
  const snowSum = daily.snowfall_sum[d] ?? 0;

  // Same layout as the Now row: hero + the card of figures, no metadata table, so
  // the picture fills the pane; see `HERO_H`.
  const markdown = useMemo(() => {
    const opts = dayHero(forecast, d, place, theme, unitSymbol, environment.appearance);
    const style = onWindow(opts.style, environment.appearance);
    const stats: Stat[] = [
      { label: "Chance of Rain", value: fmt(rain, "%") },
      ...(precipSum >= 0.1 || snowSum >= 0.1
        ? [
            {
              label: "Precipitation",
              value: `${formatPrecip(precipSum, forecast.units)}${snowSum >= 0.1 ? ` · ${formatSnow(snowSum, forecast.units)} snow` : ""}`,
            },
          ]
        : []),
      { label: "Max Wind", value: `${Math.round(daily.wind_speed_10m_max[d])} ${windUnit}` },
      { label: "UV Index", value: fmt(daily.uv_index_max[d]) },
      { label: "Sunrise", value: timeOf(daily.sunrise[d]) },
      { label: "Sunset", value: timeOf(daily.sunset[d]) },
    ];
    return [
      svgToMarkdown(renderHero({ ...opts, style }), "", LIST_FRAME),
      svgToMarkdown(renderStatsCard(stats, style), "", LIST_FRAME),
    ].join("\n\n");
  }, [forecast, place, d, unitSymbol, windUnit, theme]);

  const accessories: List.Item.Accessory[] = [];
  if (rain != null && rain >= 30) {
    accessories.push({ tag: { value: `${rain}%`, color: Color.Blue }, tooltip: "Chance of rain" });
  }
  accessories.push({ text: `${Math.round(low)}° / ${Math.round(high)}°` });

  const summary = `${name} in ${formatPlace(place)}: ${label}, high ${Math.round(high)}°${unitSymbol}, low ${Math.round(low)}°${unitSymbol}${rain != null ? `, rain ${rain}%` : ""}`;

  // Let searches like "friday", "aug 29", or "29" find the day.
  const date = isoToDate(daily.time[d]);
  const keywords = [WEEKDAYS[date.getDay()], `${MONTHS[date.getMonth()]} ${date.getDate()}`, String(date.getDate())];

  return (
    <List.Item
      title={name}
      subtitle={label}
      keywords={keywords}
      icon={{ source: iconFor(code), tintColor: tagColorFor(code) }}
      accessories={accessories}
      detail={<List.Item.Detail markdown={markdown} />}
      actions={
        <WeatherActions
          settings={settings}
          refresh={props.refresh}
          summary={summary}
          shareSvg={() => buildDayShareSvg(forecast, d, place, theme, unitSymbol, windUnit)}
        />
      }
    />
  );
}

