import { Grid } from "@raycast/api";
import { useMemo } from "react";
import { CastActions } from "./components/CastActions";
import { Setup } from "./components/Onboarding";
import { useLiveClock } from "./hooks/useLiveClock";
import { useWeatherData } from "./hooks/useWeatherData";
import { useWeatherSettings } from "./hooks/useWeatherSettings";
import { castSceneNow, renderCastScene } from "./lib/cast";
import { W } from "./lib/cast-core";
import { svgToDataUri } from "./lib/svg";
import { RETRY_HINT } from "./lib/platform";

/** 21:9, the widest cell the runtime takes, as a value `tsc` will accept. */
const WIDE_CELL = "21/9" as unknown as Grid.AspectRatio;

export default function Command() {
  const settings = useWeatherSettings();
  const { locations, active, units } = settings;
  const { forecast, airQuality, isLoading, error, revalidate } = useWeatherData(active, units, settings.forecastDays);
  // castSceneNow reads Date.now(), so `tick` is a dependency of the scene memo below.
  const tick = useLiveClock(revalidate);

  const aqi = airQuality?.current.us_aqi ?? undefined;
  const scene = useMemo(
    () =>
      forecast && active
        ? castSceneNow(forecast, active, settings.unitSymbol, aqi, settings.hideLocation)
        : undefined,
    [forecast, active, settings.unitSymbol, aqi, settings.hideLocation, tick],
  );
  // A Grid cell is the only panel Vicinae fills without a height cap, so the scene
  // goes in as a plain image source instead of markdown. 21/9 is the widest ratio
  // that still fits under the launcher's search bar; see `SCENE_H`. The cast is a
  // cast because `@raycast/api` still types only up to 16/9, while the Vicinae
  // runtime maps every ratio in `aspectRatioMap`.
  const sceneImage = useMemo(() => (scene ? svgToDataUri(renderCastScene(scene, W, "now-")) : undefined), [scene]);

  if (locations.length === 0 || !active) {
    if (settings.isLoading) return <Grid isLoading filtering={false} />;
    return <Setup settings={settings} />;
  }

  return (
    <Grid
      columns={1}
      aspectRatio={WIDE_CELL}
      inset={Grid.Inset.Zero}
      fit={Grid.Fit.Contain}
      filtering={false}
      isLoading={isLoading}
    >
      {sceneImage && (
        <Grid.Item
          id="cast"
          content={sceneImage}
          actions={<CastActions scene={scene} settings={settings} refresh={revalidate} />}
        />
      )}
      {!sceneImage && !isLoading && (
        <Grid.EmptyView
          title="Cast couldn't check the sky"
          description={error?.message ?? RETRY_HINT}
          actions={<CastActions scene={scene} settings={settings} refresh={revalidate} />}
        />
      )}
    </Grid>
  );
}
