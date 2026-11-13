import { Grid } from "@raycast/api";
import { Wallpaper } from "../types";

/**
 * The window is 798×508 and the status bar takes the rest, so the picture is laid out for a
 * 758×426 cell: 20 px of grid padding on either side, 10 px between cells.
 */
const PANEL_WIDTH = 758;
const PANEL_HEIGHT = 426;

/**
 * A single `markdown` image cannot fill the panel: Vicinae caps it at 200 px tall
 * (`MdImage.qml`, `Math.min(_rawH, 200, maxImageHeight)`), so a `Detail` shows the picture in a
 * letterbox with empty space around it. A grid cell has no such cap, which is why this page is a
 * one-cell grid. The ratios are the ones `Grid.AspectRatio` offers, with the value each stands for.
 */
const ASPECTS: [Grid.AspectRatio, number][] = [
  ["16/9", 16 / 9],
  ["3/2", 3 / 2],
  ["4/3", 4 / 3],
  ["1", 1],
  ["3/4", 3 / 4],
  ["2/3", 2 / 3],
  ["9/16", 9 / 16],
];

export function WallpaperPreview({
  wallpaper,
  actions,
}: {
  wallpaper: Wallpaper;
  actions: React.ComponentProps<typeof Grid>["actions"];
}) {
  const ratio = wallpaper.dimension_x / wallpaper.dimension_y;
  const [aspect, value] = ASPECTS.reduce((best, option) =>
    Math.abs(option[1] - ratio) < Math.abs(best[1] - ratio) ? option : best,
  );
  // A landscape picture takes the whole width in one cell. A portrait one is taller than wide, so
  // it would run off the bottom: take as many columns as it takes for its height to fit.
  const columns =
    value >= 1
      ? 1
      : Math.max(
          1,
          Math.round((PANEL_WIDTH + 10) / (PANEL_HEIGHT * value + 10)),
        );

  return (
    <Grid
      columns={columns}
      aspectRatio={aspect}
      inset={Grid.Inset.Zero}
      fit={Grid.Fit.Contain}
      filtering={false}
      navigationTitle="Wallpaper Preview"
    >
      <Grid.Item id={wallpaper.id} content={wallpaper.path} actions={actions} />
    </Grid>
  );
}
