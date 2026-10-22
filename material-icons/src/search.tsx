import { getPreferenceValues } from "@raycast/api";

import GridView from "./grid";
import ListView from "./list";

type Preferences = {
  view?: string;
};

export default function SearchMaterialIcons() {
  const { view = "grid" } = getPreferenceValues<Preferences>();

  return view === "list" ? <ListView /> : <GridView />;
}
