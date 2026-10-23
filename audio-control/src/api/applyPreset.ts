import { pactl, type PactlClient } from "../pactl";
import { isPipeWireServer } from "../utils/audioServer";
import { uniqueGroupSinkName } from "../utils/outputGroups";
import { planPresetApplication, type OutputPreset } from "../utils/presets";

export class PresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresetError";
  }
}

export type AppliedPreset = {
  sinkName: string;
  volumePercent: number;
  grouped: boolean;
};

export async function applyPreset(
  preset: OutputPreset,
  client: PactlClient = pactl,
): Promise<AppliedPreset> {
  const state = await client.fetchAudioState();
  const plan = planPresetApplication(preset, state.sinks, state.outputGroups);

  if (plan.kind === "missing") {
    throw new PresetError(
      `Outputs are not connected: ${plan.missing.join(", ")}`,
    );
  }

  if (plan.kind === "single") {
    await client.setDeviceVolume(plan.sinkName, preset.volumePercent, "sink");
    await client.setDefaultDevice(plan.sinkName, "sink");
    await client.moveAllSinkInputs(plan.sinkName);
    return {
      sinkName: plan.sinkName,
      volumePercent: preset.volumePercent,
      grouped: false,
    };
  }

  if (plan.kind === "existing-group") {
    const { sinkName } = plan.group;
    await client.setDeviceVolume(sinkName, preset.volumePercent, "sink");
    await client.setDefaultDevice(sinkName, "sink");
    await client.moveAllSinkInputs(sinkName);
    return { sinkName, volumePercent: preset.volumePercent, grouped: true };
  }

  const sinkName = uniqueGroupSinkName(
    state.sinks.map((sink) => sink.name),
    Math.floor(Date.now() / 1000),
  );
  const moduleId = await client.loadCombineSink({
    sinkName,
    members: plan.members,
    pipewire: isPipeWireServer(state.info.server_name),
  });

  try {
    await client.setDeviceVolume(sinkName, preset.volumePercent, "sink");
    await client.setDefaultDevice(sinkName, "sink");
    await client.moveAllSinkInputs(sinkName);
  } catch (error) {
    await client.unloadModule(moduleId).catch(() => undefined);
    throw error;
  }

  return { sinkName, volumePercent: preset.volumePercent, grouped: true };
}
