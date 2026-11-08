import { Toast, getPreferenceValues, showToast } from "@vicinae/api";

import CreateHotspotNmcli from "./nmcli/create-hotspot";

export default async function CreateHotspot() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();

  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      return CreateHotspotNmcli();

    case "iwctl": {
      await showToast({
        style: Toast.Style.Failure,
        title: "The hotspot needs nmcli",
        message: "iwctl has no hotspot command here. Set Network CLI Tool to nmcli in the extension settings.",
      });
      return;
    }

    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
}
