import { cyclePreset } from "~/api/presets";

export default async function PreviousPreset() {
  await cyclePreset(-1);
}
