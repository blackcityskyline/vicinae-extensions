import {
  Action,
  ActionPanel,
  Clipboard,
  getPreferenceValues,
  Icon,
  Keyboard,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";
import { Wallpaper } from "../types";
import {
  downloadImage,
  expandHome,
  getFileExtension,
  getTempFilePath,
  setDesktopWallpaper,
} from "../utils";
import { WallpaperPreview } from "./WallpaperPreview";
import { SimilarWallpapers } from "./SimilarWallpapers";

/**
 * The named shortcut ids the server resolves and remaps through the user's keybinds
 * (`NAMED_SHORTCUTS` in Vicinae's model-deser). `@raycast/api` 1.104, which this extension
 * pins, types the prop as a key object only, so the string needs a cast; 2.5.3 accepts it.
 */
const named = (id: "copy" | "open") => id as unknown as Keyboard.Shortcut;

async function downloadToTemp(wallpaper: Wallpaper): Promise<string> {
  const ext = getFileExtension(wallpaper.path);
  const tempPath = getTempFilePath(`wallhaven-${wallpaper.id}.${ext}`);
  await downloadImage(wallpaper.path, tempPath);
  return tempPath;
}

export function WallpaperActions({ wallpaper }: { wallpaper: Wallpaper }) {
  const { downloadDir } = getPreferenceValues<Preferences>();
  const resolvedDownloadDir = expandHome(downloadDir || join(homedir(), "Downloads"));

  async function handleSetWallpaper() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Setting wallpaper...",
    });
    try {
      const tempPath = await downloadToTemp(wallpaper);
      await setDesktopWallpaper(tempPath);
      toast.hide();
      await showHUD("Wallpaper set!");
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to set wallpaper";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  async function handleDownload() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Downloading...",
    });
    try {
      await mkdir(resolvedDownloadDir, { recursive: true });
      const ext = getFileExtension(wallpaper.path);
      const destPath = join(
        resolvedDownloadDir,
        `wallhaven-${wallpaper.id}.${ext}`,
      );
      await downloadImage(wallpaper.path, destPath);
      toast.style = Toast.Style.Success;
      toast.title = "Downloaded!";
      toast.message = destPath;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  async function handleCopyImage() {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Copying image...",
    });
    try {
      const tempPath = await downloadToTemp(wallpaper);
      await Clipboard.copy({ file: tempPath });
      toast.hide();
      await showHUD("Image copied to clipboard!");
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to copy image";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return (
    <ActionPanel>
      <ActionPanel.Section title="Wallpaper">
        {/* Upstream had "Set on All Desktops" and "Set on Current Desktop" separately. Every
            backend here sets every output, so the second action could only have quietly done
            the first thing. Its shortcut, shift+cmd+W, moved to the surviving action. */}
        <Action
          title="Set Wallpaper"
          icon={Icon.Desktop}
          shortcut={{ modifiers: ["shift", "ctrl"], key: "w" }}
          onAction={handleSetWallpaper}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="View">
        <Action.Push
          title="Preview Wallpaper"
          icon={Icon.Eye}
          shortcut={{ modifiers: ["ctrl"], key: "y" }}
          target={
            <WallpaperPreview
              wallpaper={wallpaper}
              actions={<WallpaperActions wallpaper={wallpaper} />}
            />
          }
        />
        <Action.Push
          title="Search Similar"
          icon={Icon.MagnifyingGlass}
          shortcut={{ modifiers: ["shift", "ctrl"], key: "s" }}
          target={<SimilarWallpapers wallpaperId={wallpaper.id} />}
        />
        <Action.OpenInBrowser
          title="Open in Browser"
          // Vicinae spells this icon `globe-01`; `@raycast/api` types only know `Globe`, which is
          // not a Vicinae icon and renders nothing.
          icon="globe-01"
          url={wallpaper.url}
          // The launcher's own generic "open", not a literal ctrl+o, so a keybind remap applies.
          shortcut={named("open")}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Save">
        <Action
          title="Download"
          icon={Icon.Download}
          shortcut={{ modifiers: ["ctrl"], key: "d" }}
          onAction={handleDownload}
        />
        <Action
          title="Copy Image to Clipboard"
          icon={Icon.Image}
          // The generic copy verb: ctrl+shift+c by default, remappable.
          shortcut={named("copy")}
          onAction={handleCopyImage}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Copy">
        {/* None of these can be ctrl+c or ctrl+a: the search field has the keyboard focus,
            and QML's text input eats both (select all, copy an empty selection), so the action
            never fires and the clipboard ends up empty. Measured, not assumed. */}
        <Action.CopyToClipboard
          title="Copy Image URL"
          icon={Icon.Link}
          content={wallpaper.path}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "l" }}
        />
        <Action.CopyToClipboard
          title="Copy Wallpaper ID"
          icon={Icon.Hashtag}
          content={wallpaper.id}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
        />
        <Action.CopyToClipboard
          title="Copy Color Palette"
          icon={Icon.Swatch}
          content={wallpaper.colors.join(", ")}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "h" }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
