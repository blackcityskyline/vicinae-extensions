import { LocalStorage } from "@vicinae/api";

import type { OutputPreset } from "../utils/presets";
import {
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
} from "../utils/presets";

const STORAGE_KEY = "audio-control.output-presets";

export async function loadPresets(): Promise<OutputPreset[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  return parsePresets(raw);
}

export async function savePreset(preset: OutputPreset): Promise<void> {
  const presets = await loadPresets();
  await LocalStorage.setItem(
    STORAGE_KEY,
    serializePresets(upsertPreset(presets, preset)),
  );
}

export async function deletePreset(name: string): Promise<void> {
  const presets = await loadPresets();
  await LocalStorage.setItem(
    STORAGE_KEY,
    serializePresets(removePreset(presets, name)),
  );
}
