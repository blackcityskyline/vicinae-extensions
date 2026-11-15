import { Toast, showToast, type LaunchProps } from "@vicinae/api";
import { collect, matchProcesses } from "~/proc";

/** Never ours to signal: init, and the two processes this extension lives in. */
const PROTECTED = new Set([1, process.pid, process.ppid]);

/**
 * The original ran `pgrep -f "<name>"` through a shell, so a name with a quote
 * or a `;` in it was a command line, not a process name. `matchProcesses`
 * reads the table itself, with no shell anywhere in the way.
 */
export default async function KillProcess(
  props: LaunchProps<{ arguments: Arguments.Kill }>,
) {
  // A deeplink cannot carry a command argument, so this can be absent even
  // though the manifest marks it required and the type says it is there.
  const wanted = (props.arguments?.processName ?? "").trim();
  if (wanted === "") {
    await showToast({
      style: Toast.Style.Failure,
      title: "Name a process",
      message: "Nothing to match against.",
    });
    return;
  }

  const found = matchProcesses(collect().processes, wanted);
  const targets = found.filter((row) => !PROTECTED.has(row.pid));
  if (targets.length === 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: found.length === 0 ? `No process matches ${wanted}` : `${wanted} is the launcher`,
      message:
        found.length === 0
          ? "Nothing was signalled."
          : `PID ${found.map((row) => row.pid).join(", ")} was left alone.`,
    });
    return;
  }

  const killed: string[] = [];
  const failed: string[] = [];
  for (const row of targets) {
    try {
      process.kill(row.pid, "SIGTERM");
      killed.push(`${row.name} (${row.pid})`);
    } catch (caught) {
      failed.push(`${row.name} (${row.pid}): ${caught instanceof Error ? caught.message : caught}`);
    }
  }

  await showToast({
    style: failed.length === 0 ? Toast.Style.Success : Toast.Style.Failure,
    title: `SIGTERM sent to ${killed.length} process${killed.length === 1 ? "" : "es"}`,
    message: (failed.length === 0 ? killed : failed).join("\n"),
  });
}
