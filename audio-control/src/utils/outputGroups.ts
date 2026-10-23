export const GROUP_SINK_PREFIX = "audio_control_group_";

export type OutputGroup = {
  moduleId: number;
  sinkName: string;
  members: string[];
};

function argumentValue(argument: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${key}=(\\S+)`).exec(argument);
  return match?.[1];
}

/**
 * Reads `pactl list short modules`, the only listing that carries the module index
 * (`pactl -f json list modules` omits it).
 */
export function parseOutputGroups(shortModules: string): OutputGroup[] {
  const groups: OutputGroup[] = [];

  for (const line of shortModules.split("\n")) {
    const [rawId, moduleName, ...rest] = line.split("\t");
    if (moduleName !== "module-combine-sink") continue;

    const moduleId = Number(rawId);
    if (!Number.isInteger(moduleId)) continue;

    const argument = rest.join("\t");
    const sinkName = argumentValue(argument, "sink_name");
    const memberList =
      argumentValue(argument, "sinks") ?? argumentValue(argument, "slaves");
    if (!sinkName || !memberList) continue;

    groups.push({
      moduleId,
      sinkName,
      members: memberList.split(",").filter(Boolean),
    });
  }

  return groups;
}

export function combineSinkArgs(args: {
  sinkName: string;
  members: string[];
  pipewire: boolean;
}): string[] {
  return [
    `sink_name=${args.sinkName}`,
    `${args.pipewire ? "sinks" : "slaves"}=${args.members.join(",")}`,
  ];
}

export function newGroupSinkName(nowSeconds: number, counter: number): string {
  return `${GROUP_SINK_PREFIX}${nowSeconds}_${counter}`;
}

export function uniqueGroupSinkName(
  existingSinkNames: Iterable<string>,
  nowSeconds: number,
): string {
  const existing = new Set(existingSinkNames);
  let counter = 1;
  let name = newGroupSinkName(nowSeconds, counter);
  while (existing.has(name)) {
    counter += 1;
    name = newGroupSinkName(nowSeconds, counter);
  }
  return name;
}

export function ungroupTarget(
  group: OutputGroup,
  existingSinkNames: readonly string[],
): string | undefined {
  const names = new Set(existingSinkNames);
  return group.members.find(
    (member) => member !== group.sinkName && names.has(member),
  );
}
