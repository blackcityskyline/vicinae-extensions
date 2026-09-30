import { showToast, Toast } from "@vicinae/api";

import { cancelWorkflowRun } from "~/api/github";
import { GitHubError } from "~/api/client";

type Input = {
  arguments: {
    owner: string;
    repository: string;
    runId: string;
  };
};

/**
 * Cancel an in-progress workflow run.
 *
 * Registered as a no-view command so it can be reached from the command palette
 * with arguments, and from the Workflow Runs list. The run id arrives as a
 * string because arguments are always strings, so it is validated here rather
 * than trusted.
 */
export default async function CancelWorkflowRun({ arguments: args }: Input) {
  const runId = Number(args.runId);
  if (!Number.isInteger(runId) || runId <= 0) {
    await showToast({ title: `"${args.runId}" is not a workflow run id.`, style: Toast.Style.Failure });
    return;
  }

  try {
    await cancelWorkflowRun(args.owner, args.repository, runId);
    await showToast({
      title: `Cancelling run ${runId}`,
      message: `${args.owner}/${args.repository}`,
      style: Toast.Style.Success,
    });
  } catch (error) {
    const title =
      error instanceof GitHubError && error.status === 409
        ? `Run ${runId} has already finished and cannot be cancelled.`
        : (error as Error).message;
    await showToast({ title, style: Toast.Style.Failure });
  }
}
