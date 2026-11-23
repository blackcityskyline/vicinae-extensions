import { Grid, Color, Icon } from "@raycast/api";
import { Wallpaper } from "../types";
import { formatFileSize, purityColor } from "../utils";
import { WallpaperActions } from "./WallpaperActions";

interface WallpaperGridProps {
  wallpapers: Wallpaper[];
  isLoading: boolean;
  /** When using onLoadMore, pass the actual hasMore value from pagination refs. Defaulting to true would cause infinite scroll past the last page. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  navigationTitle?: string;
  searchBarAccessory?: Grid.Props["searchBarAccessory"];
  searchBarPlaceholder?: string;
  onSearchTextChange?: (text: string) => void;
  throttle?: boolean;
}

export function WallpaperGrid({
  wallpapers,
  isLoading,
  hasMore = true,
  onLoadMore,
  navigationTitle,
  searchBarAccessory,
  searchBarPlaceholder,
  onSearchTextChange,
  throttle,
}: WallpaperGridProps) {
  return (
    <Grid
      navigationTitle={navigationTitle}
      isLoading={isLoading}
      searchBarPlaceholder={searchBarPlaceholder}
      searchBarAccessory={
        searchBarAccessory as Grid.Props["searchBarAccessory"]
      }
      onSearchTextChange={onSearchTextChange}
      throttle={throttle}
      columns={4}
      pagination={
        onLoadMore
          ? {
              onLoadMore,
              hasMore,
              pageSize: 24,
            }
          : undefined
      }
    >
      {wallpapers.map((wallpaper, index) => (
        <Grid.Item
          key={`${wallpaper.id}-${index}`}
          // A grid cell hosts no button: Vicinae draws its picture, title, subtitle and tooltip
          // and nothing else, so hovering names the action and Enter or a double click is what
          // opens the picture on the whole panel (the preview is the primary action here).
          content={{ value: wallpaper.thumbs.small, tooltip: "Preview image" }}
          title={wallpaper.resolution}
          subtitle={formatFileSize(wallpaper.file_size)}
          accessory={{
            icon: {
              source: Icon.Circle,
              tintColor: purityColor(wallpaper.purity) as Color,
            },
            tooltip: wallpaper.purity.toUpperCase(),
          }}
          actions={<WallpaperActions wallpaper={wallpaper} previewFirst />}
        />
      ))}
    </Grid>
  );
}
