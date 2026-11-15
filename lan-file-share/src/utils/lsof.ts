import type { PortOwner } from "~/utils/types";

/** Parses `lsof -F pcu`: one `p<pid>`, `c<command>`, `u<uid>` block per process. */
export function parseLsofOwners(output: string): PortOwner[] {
  const owners: PortOwner[] = [];
  let current: Partial<PortOwner> = {};
  const flush = () => {
    if (current.pid !== undefined) {
      owners.push({
        pid: current.pid,
        command: current.command ?? "unknown",
        user: current.user ?? "unknown",
      });
    }
    current = {};
  };
  for (const line of output.split("\n")) {
    if (line === "") continue;
    const value = line.slice(1);
    switch (line[0]) {
      case "p":
        flush();
        current.pid = Number(value);
        break;
      case "c":
        current.command = value;
        break;
      case "u":
        current.user = value;
        break;
      default:
        break;
    }
  }
  flush();
  return owners;
}
