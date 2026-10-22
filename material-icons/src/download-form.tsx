import {
  Action,
  ActionPanel,
  Form,
  Icon as RaycastIcon,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { useState } from "react";

import { DownloadFormat, DownloadPlatform, downloadAsset, downloadUrl, MaterialIcon } from "./icons";

export default function DownloadForm({ icon }: { icon: MaterialIcon }) {
  const [platform, setPlatform] = useState<DownloadPlatform>("Web");
  const [color, setColor] = useState("Black");
  const [size, setSize] = useState("24");
  const [format, setFormat] = useState<DownloadFormat>("PNG");

  async function download() {
    const progress = await showToast({ title: "Downloading...", style: Toast.Style.Animated });

    try {
      const asset = downloadAsset(platform, format, color, size);
      if (!asset) throw new Error("No asset for this combination");

      const url = downloadUrl(icon, asset);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

      const directory = path.join(os.homedir(), "Downloads");
      await mkdir(directory, { recursive: true });
      const filePath = path.join(directory, `icon_${icon.name}-${asset}`);
      await writeFile(filePath, Buffer.from(await response.arrayBuffer()));

      await progress.hide();
      await showToast({
        style: Toast.Style.Success,
        title: `Downloaded ${icon.name}`,
        message: filePath,
      });
    } catch (error) {
      await progress.hide();
      await showFailureToast(error, { title: "Could not download the icon" });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action
            icon={RaycastIcon.Download}
            title="Download"
            shortcut={{ modifiers: ["cmd"], key: "d" }}
            onAction={download}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="platform" title="Platform" onChange={(value) => setPlatform(value as DownloadPlatform)}>
        <Form.Dropdown.Item title="Web" value="Web" />
        <Form.Dropdown.Item title="Android" value="Android" />
        <Form.Dropdown.Item title="IOS" value="IOS" />
      </Form.Dropdown>

      <Form.Dropdown id="color" title="Color" onChange={setColor}>
        <Form.Dropdown.Item
          title="Black"
          value="Black"
          icon={{ source: RaycastIcon.Circle, tintColor: { dark: "black", light: "black" } }}
        />
        <Form.Dropdown.Item
          title="White"
          value="White"
          icon={{ source: RaycastIcon.Circle, tintColor: { dark: "white", light: "white" } }}
        />
      </Form.Dropdown>

      {platform === "Web" && (
        <>
          <Form.Dropdown id="format" title="Format" onChange={(value) => setFormat(value as DownloadFormat)}>
            <Form.Dropdown.Item title="PNG" value="PNG" />
            <Form.Dropdown.Item title="SVG" value="SVG" />
          </Form.Dropdown>

          {format === "PNG" && (
            <Form.Dropdown id="size" title="Size" onChange={setSize}>
              <Form.Dropdown.Item title="18dp" value="18" />
              <Form.Dropdown.Item title="24dp" value="24" />
              <Form.Dropdown.Item title="36dp" value="36" />
              <Form.Dropdown.Item title="48dp" value="48" />
            </Form.Dropdown>
          )}
        </>
      )}
    </Form>
  );
}
