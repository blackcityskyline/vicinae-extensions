import { cyclePreset } from "~/api/presets";

export default async function NextPreset() {
  await cyclePreset(1);
}
