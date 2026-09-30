/**
 * Pure helpers for the vectis daemon.
 *
 * Nothing here imports `@vicinae/api`, so `test/vectis.test.ts` can run it
 * headlessly. The half that spawns `vectis` lives in `~/api/vectis.ts`.
 */

export type PowerProfileValue = "powersave" | "balanced" | "performance";
export type GpuModeValue = "integrated" | "hybrid" | "discrete";

export type PowerProfile = {
  value: PowerProfileValue;
  title: string;
  description: string;
  keywords: string[];
  /**
   * The name `tlp` receives. It is not the profile name: vectisd maps
   * powersave onto `tlp power-saver`. Surfaced because it is the thing that
   * actually differs between the three.
   */
  tlpSubcommand: string;
};

export const POWER_PROFILES: PowerProfile[] = [
  {
    value: "powersave",
    title: "Powersave",
    description: "Lowest clocks and fan noise. tlp power-saver.",
    keywords: ["power save", "battery", "quiet", "cool", "energy"],
    tlpSubcommand: "power-saver",
  },
  {
    value: "balanced",
    title: "Balanced",
    description: "Scales up under load, down when idle.",
    keywords: ["balance", "default", "normal", "auto"],
    tlpSubcommand: "balanced",
  },
  {
    value: "performance",
    title: "Performance",
    description: "Holds boost clocks. Runs hot and loud.",
    keywords: ["max", "turbo", "boost", "speed", "power"],
    tlpSubcommand: "performance",
  },
];

export type GpuMode = {
  value: GpuModeValue;
  title: string;
  description: string;
  keywords: string[];
};

export const GPU_MODES: GpuMode[] = [
  {
    value: "integrated",
    title: "Integrated",
    description: "Discrete GPU powered off. Battery life, no gaming.",
    keywords: ["igpu", "intel", "amd", "integrated graphics", "battery", "off"],
  },
  {
    value: "hybrid",
    title: "Hybrid",
    description: "Discrete GPU on, the integrated one drives the display.",
    keywords: ["optimus", "hybrid", "pr-switch", "on demand"],
  },
  {
    value: "discrete",
    title: "Discrete",
    description: "Discrete GPU drives the display. Degrades to hybrid on muxless.",
    keywords: ["dgpu", "nvidia", "discrete", "unified", "exclusive"],
  },
];

// ---------------------------------------------------------------------------
// Argument construction
//
// These return argv arrays, never a shell string: the daemon decides what to do
// with them, and `tlp`, `bbswitch` and sysfs writes all sit downstream of
// whatever reaches them.
// ---------------------------------------------------------------------------

export function profileArgs(profile: string): string[] | null {
  return isPowerProfile(profile) ? ["profile", profile] : null;
}

export function isPowerProfile(value: string): value is PowerProfileValue {
  return POWER_PROFILES.some((p) => p.value === value);
}

export function isGpuMode(value: string): value is GpuModeValue {
  return GPU_MODES.some((m) => m.value === value);
}

export function gpuArgs(
  mode: string,
  options: { force?: boolean; nouveau?: boolean } = {},
): string[] | null {
  if (!isGpuMode(mode)) return null;

  const args = ["gpu", mode];
  // nouveau selects nouveau instead of the proprietary driver. It only has a
  // meaning while the discrete card is in use, so it is not offered for
  // integrated, where the daemon would ignore it anyway.
  if (options.nouveau && mode !== "integrated") args.push("--nouveau");
  if (options.force) args.push("--force");
  return args;
}

/**
 * Which driver the discrete card should use.
 *
 * These are the two values `GpuDriverPref::from_str` accepts on the D-Bus side;
 * `vectis gpu --nouveau` is the CLI's spelling of "open". "auto" is the
 * proprietary driver and is the default, so it comes first.
 */
export const GPU_DRIVERS: { value: string; title: string }[] = [
  { value: "auto", title: "Proprietary (nvidia)" },
  { value: "open", title: "Open source (nouveau)" },
];

/**
 * Whether a switch is queued or applied immediately.
 *
 * "queue" is first because it is the default and the only one of the two that
 * cannot end the session: `vectis gpu <mode>` without `--force` records the
 * change and applies it on the next logout or boot.
 */
export const GPU_APPLIES: { value: string; title: string; description: string }[] = [
  { value: "queue", title: "Queue", description: "Applies on the next logout or boot. Safe." },
  { value: "force", title: "Now", description: "Applies immediately and ends your session, including the launcher." },
];

export type GpuSwitch = { force: boolean; nouveau: boolean };

/**
 * Turns the two selector values into the flags `gpuArgs` needs.
 *
 * Returns null for a value it does not recognise, rather than defaulting:
 * a stored value that is not "force" must never turn into `--force`.
 */
export function gpuSwitchOptions(driver: string, apply: string): GpuSwitch | null {
  if (!GPU_DRIVERS.some((d) => d.value === driver)) return null;
  if (!GPU_APPLIES.some((a) => a.value === apply)) return null;

  return { force: apply === "force", nouveau: driver === "open" };
}

/**
 * The subtitle for a GPU mode row.
 *
 * The two selectors sit in the search bar, which is easy to stop looking at
 * once the list is on screen. This is where the user reads what Enter is about
 * to do, so it names both settings rather than leaving them to the accessory.
 */
export function modeSubtitle(mode: GpuMode, options: GpuSwitch | null): string {
  if (options === null) return mode.description;

  const driver = options.nouveau ? "nouveau" : "nvidia proprietary";
  const timing = options.force
    ? "applies now and ends the session"
    : "queued for the next logout";

  return `${mode.description}  ·  ${driver}  ·  ${timing}`;
}

export type TdpInput = {  pl1?: number | undefined;
  pl2?: number | undefined;
  tau?: number | undefined;
  hardLock?: boolean | undefined;
};

/**
 * Builds `vectis tdp …`. Returns null when a value could not be a u32, because
 * a negative watts value reaches sysfs as a negative number of microwatts.
 */
export function tdpArgs(input: TdpInput): string[] | null {
  const args = ["tdp"];

  for (const [flag, value] of [
    ["--pl1", input.pl1],
    ["--pl2", input.pl2],
    ["--tau", input.tau],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
    // The D-Bus method takes u32, so anything above that cannot be delivered.
    if (value > 0xffff_ffff) return null;
    args.push(flag, String(value));
  }

  if (input.hardLock) args.push("--hard-lock");
  return args;
}

/** The u32 argument values the CLI accepts, used to pre-validate form input. */
export const MAX_U32 = 0xffff_ffff;

// ---------------------------------------------------------------------------
// Parsing output from another program
// ---------------------------------------------------------------------------

export type DaemonStatus = {
  activeProfile: PowerProfileValue | null;
  powerBackend: string;
  tlpServiceActive: boolean;
  tdpPl1Watts: number | null;
  tdpPl2Watts: number | null;
  gpuMode: GpuModeValue | null;
  gpuPowerState: string;
  gpuPending: GpuModeValue | null;
  gpuLastAutoApplyError: string | null;
  conflictingServices: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: (value: string) => value is T,
): T | null | undefined {
  const text = optionalString(value);
  if (text === undefined || text === null) return text;
  return allowed(text) ? text : undefined;
}

/**
 * Parses `vectis status --json`.
 *
 * Returns null unless every field is present and of the right type. A partially
 * parsed status would render as though a setting were unset, which is worse than
 * showing nothing and saying the output was not understood.
 */
export function parseStatus(json: string): DaemonStatus | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const activeProfile = optionalEnum(raw.active_profile, isPowerProfile);
  const powerBackend = raw.power_backend;
  const tlpServiceActive = raw.tlp_service_active;
  const tdpPl1Watts = optionalNumber(raw.tdp_pl1_watts);
  const tdpPl2Watts = optionalNumber(raw.tdp_pl2_watts);
  const gpuMode = optionalEnum(raw.gpu_mode, isGpuMode);
  const gpuPowerState = raw.gpu_power_state;
  const gpuPending = optionalEnum(raw.gpu_pending, isGpuMode);
  const gpuLastAutoApplyError = optionalString(raw.gpu_last_auto_apply_error);
  const conflictingServices = raw.conflicting_services;

  if (
    activeProfile === undefined ||
    typeof powerBackend !== "string" ||
    typeof tlpServiceActive !== "boolean" ||
    tdpPl1Watts === undefined ||
    tdpPl2Watts === undefined ||
    gpuMode === undefined ||
    typeof gpuPowerState !== "string" ||
    gpuPending === undefined ||
    gpuLastAutoApplyError === undefined ||
    !Array.isArray(conflictingServices) ||
    !conflictingServices.every((s): s is string => typeof s === "string")
  ) {
    return null;
  }

  return {
    activeProfile,
    powerBackend,
    tlpServiceActive,
    tdpPl1Watts,
    tdpPl2Watts,
    gpuMode,
    gpuPowerState,
    gpuPending,
    gpuLastAutoApplyError,
    conflictingServices,
  };
}

const PCI_VENDORS: Record<string, string> = {
  "0x10de": "NVIDIA",
  "0x8086": "Intel",
  "0x1002": "AMD",
  "0x1022": "AMD",
};

export function vendorName(vendorId: string): string {
  return PCI_VENDORS[vendorId.toLowerCase()] ?? vendorId;
}

const PCI_CLASSES: Record<string, string> = {
  "0x030000": "VGA compatible controller",
  "0x030200": "3D controller",
};

export function deviceClassLabel(classId: string): string {
  return PCI_CLASSES[classId.toLowerCase()] ?? classId;
}

export type GpuDevice = {
  address: string;
  vendor: string;
  vendorName: string;
  device: string;
  driver: string | null;
  classId: string;
  /**
   * A 3D controller is the discrete card on every laptop this targets; a VGA
   * compatible controller is the integrated one. The class code is the only
   * signal `vectis gpu-list` gives, since it returns raw PCI ids.
   */
  isDiscrete: boolean;
};

/**
 * Parses `vectis gpu-list`.
 *
 * A device missing its PCI ids is dropped rather than rendered as an unknown
 * row: half a device tells the user nothing actionable.
 */
export function parseGpuDevices(json: string): GpuDevice[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const devices: GpuDevice[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { address, vendor, device, class: classId } = entry;
    if (
      typeof address !== "string" ||
      typeof vendor !== "string" ||
      typeof device !== "string" ||
      typeof classId !== "string"
    ) {
      continue;
    }

    const driver = entry.driver;
    devices.push({
      address,
      vendor,
      vendorName: vendorName(vendor),
      device,
      driver: typeof driver === "string" ? driver : null,
      classId,
      isDiscrete: classId.toLowerCase() === "0x030200",
    });
  }
  return devices;
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

export type FailureKind =
  | "daemon-down"
  | "daemon-too-old"
  | "bus-unreachable"
  | "unauthorized"
  | "invalid-profile"
  | "invalid-gpu-mode"
  | "rapl-unsupported"
  | "backend-slow"
  | "unknown";

export type Failure = { kind: FailureKind; message: string };

/**
 * Translates vectis' own error text into something the user can act on.
 *
 * Every pattern here was copied from output this machine actually produced, so
 * the wording is a set of facts about vectisd rather than a guess. Anything
 * unrecognised keeps the daemon's words: a wrong guess would send the user
 * chasing the wrong problem.
 */
export function classifyFailure(stderr: string): Failure {
  const text = stderr.trim();

  if (/failed to connect to system bus/i.test(text)) {
    return {
      kind: "bus-unreachable",
      message:
        "The system D-Bus is not reachable, so vectisd cannot be reached either. " +
        "Check that dbus.service is running.",
    };
  }

  if (/failed to reach vectisd|ServiceUnknown|org\.vectis\.Daemon1 was not provided/i.test(text)) {
    return {
      kind: "daemon-down",
      message: "vectisd is not running. Start it with: sudo systemctl enable --now vectisd",
    };
  }

  // Action ids are hyphenated (`org.vectis.apply-profile`), so \w is not enough
  // here: it truncates the id to `org.vectis.apply`.
  // The CLI and the daemon are installed separately, so a newer CLI against an
  // older daemon lands here. Without this the user gets "Unknown method" and
  // has no reason to suspect the version.
  if (/UnknownMethod|Unknown method/i.test(text)) {
    return {
      kind: "daemon-too-old",
      message:
        "This vectis CLI is newer than the running vectisd, which does not implement this " +
        "subcommand. Rebuild the workspace and restart the daemon: sudo systemctl restart vectisd",
    };
  }

  const denied = /not authorized for ([\w.-]+)/i.exec(text);
  if (/AccessDenied/i.test(text) && denied) {
    return {
      kind: "unauthorized",
      message:
        `PolicyKit denied ${denied[1]}. The daemon allows this from your own active ` +
        "graphical session, so a lock screen or a remote shell will be refused.",
    };
  }

  const badProfile = /unknown profile '([^']*)'.*\(expected ([^)]*)\)/i.exec(text);
  if (badProfile) {
    return {
      kind: "invalid-profile",
      message: `vectisd does not have a profile called '${badProfile[1]}'. It has: ${badProfile[2]}.`,
    };
  }

  const badMode = /unknown gpu mode '([^']*)'.*\(expected ([^)]*)\)/i.exec(text);
  if (badMode) {
    return {
      kind: "invalid-gpu-mode",
      message: `vectisd does not have a GPU mode called '${badMode[1]}'. It has: ${badMode[2]}.`,
    };
  }

  if (/RAPL not supported/i.test(text)) {
    return {
      kind: "rapl-unsupported",
      message: "This CPU exposes no RAPL package zone, so there is no TDP limit to set.",
    };
  }

  // Observed on this machine: vectisd gives `tlp <profile>` 15 seconds and kills
  // it when it overruns. TLP regenerates udev rules, so it is occasionally slow
  // enough to trip that, which looks like a failure but is the backend being
  // slow rather than the setting being rejected. The daemon and its journal
  // word this differently, so both shapes are matched.
  const slow = /\b(tlp|asusd|power-profiles-daemon)((?: [\w-]+)?)['"]?[^,.]{0,20}?(timed out|exceeded)/i.exec(text);
  if (slow) {
    const command = `${slow[1]}${slow[2]}`.trim();
    return {
      kind: "backend-slow",
      message:
        `vectisd killed '${command}' after its 15 second timeout, so the setting was not applied. ` +
        "TLP is slow when it regenerates udev rules. Try again; if it keeps happening, raise " +
        "COMMAND_TIMEOUT in vectisd/src/backends/tlp.rs.",
    };
  }

  return { kind: "unknown", message: text.length > 0 ? text : "vectis failed with no message." };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export function gpuDevicesMarkdown(devices: GpuDevice[]): string {
  if (devices.length === 0) {
    return "## Display devices\n\nvectis gpu-list returned nothing. That is unexpected on a machine with a GPU.";
  }

  const lines = ["## Display devices", ""];
  for (const device of devices) {
    const driver = device.driver ?? "no driver bound";
    // The raw PCI ids are kept because they are what the daemon actually
    // reports, and "which of these two is the discrete card" is answered by the
    // class code rather than by the vendor.
    lines.push(
      `- \`${device.address}\` ${device.vendorName} ${device.vendor}:${device.device}, ` +
        `${deviceClassLabel(device.classId)}${device.isDiscrete ? " — discrete card" : ""} — ${driver}`,
    );
  }
  return lines.join("\n");
}

function watts(value: number | null): string {
  // A machine with no RAPL zone reports null, which is not the same as 0 W:
  // writing 0 W would read as a deliberate cap.
  return value === null ? "unknown" : `${value}W`;
}

export function statusMarkdown(status: DaemonStatus): string {
  const lines: string[] = [
    "## Power profile",
    status.activeProfile ?? "unknown",
    "",
    `Backend: \`${status.powerBackend}\`${status.tlpServiceActive ? " (TLP active)" : ""}`,
    "",
    "## Power limit",
    `Sustained PL1: ${watts(status.tdpPl1Watts)}`,
    `Boost PL2: ${watts(status.tdpPl2Watts)}`,
    "",
    "## GPU",
    `Mode: ${status.gpuMode ?? "unknown"}`,
    `Discrete card: ${status.gpuPowerState}`,
  ];

  if (status.gpuPending !== null) {
    lines.push("", `**Queued for the next logout or boot: ${status.gpuPending}**`);
  }
  if (status.gpuLastAutoApplyError !== null) {
    lines.push("", `Last automatic switch failed: ${status.gpuLastAutoApplyError}`);
  }
  if (status.conflictingServices.length > 0) {
    lines.push(
      "",
      "## Conflicting services",
      "These also manage the GPU and will fight vectisd:",
      ...status.conflictingServices.map((service) => `- ${service}`),
    );
  }

  return lines.join("\n");
}