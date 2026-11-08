import { getPreferenceValues, Icon, List } from "@vicinae/api";

import CreateHotspotNmcli from "./nmcli/create-hotspot";

export default function CreateHotspot() {
  const networkCliTool = getPreferenceValues<{ "network-cli-tool": string }>();

  switch (networkCliTool["network-cli-tool"]) {
    case "nmcli":
      return CreateHotspotNmcli();

    case "iwctl":
      return (
        <List>
          <List.EmptyView
            icon={Icon.Warning}
            title="The hotspot needs nmcli"
            description="iwctl has no hotspot command here. Set Network CLI Tool to nmcli in the extension settings."
          />
        </List>
      );

    default:
      throw new Error("Invalid network CLI tool: " + networkCliTool["network-cli-tool"]);
  }
}
