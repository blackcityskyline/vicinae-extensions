import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseLsofOwners } from "~/utils/lsof";
import type { PortOwner } from "~/utils/types";

const run = promisify(execFile);

/**
 * Processes listening on a TCP port, so the panel can say which program holds it. `lsof` is optional: it exits 1
 * when nothing listens on the port and is not installed on every distribution, and both leave the conflict
 * message naming no program, which is still true.
 */
export async function findPortOwners(port: number): Promise<PortOwner[]> {
  if (!Number.isInteger(port)) return [];
  try {
    const { stdout } = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pcu"], {
      timeout: 3000,
    });
    return parseLsofOwners(stdout);
  } catch {
    return [];
  }
}

export async function findPortOwner(port: number): Promise<PortOwner | undefined> {
  return (await findPortOwners(port))[0];
}
