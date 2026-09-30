import { showToast, Toast } from "@vicinae/api";

import { rerunWorkflowRun } from "~/api/github";
import { GitHubError } from "~/api/client";

type Input = {
  arguments: {
    owner: string;
    repository: string;
    runId: string;
    failedJobsOnly?: string;
  };
};

/**
 * Rerun a workflow run, optionally only its failed jobs.
 *
 * `failedJobsOnly` is a string argument so the command palette can reach it
 * without a form; anything other than "true" reruns the whole run.
 */
export default async function RerunWorkflowRun({ arguments: args }: Input) {
  const runId = Number(args.runId);
  if (!Number.isInteger(runId) || runId <= 0) {
    await showToast({ title: `"${args.runId}" is not a workflow run id.`, style: Toast.Style.Failure });
    return;
  }

  const failedJobsOnly = args.failedJobsOnly === "true";

  try {
    await rerunWorkflowRun(args.owner, args.repository, runId, failedJobsOnly);
    await showToast({
      title: failedJobsOnly ? `Rerunning failed jobs in run ${runId}` : `Rerunning run ${runId}`,
      message: `${args.owner}/${args.repository}`,
      style: Toast.Style.Success,
    });
  } catch (error) {
    const title =
      error instanceof GitHubError && error.status === 403
        ? `The token cannot rerun workflows in ${args.owner}/${args.repository}. It needs the Actions write scope.`
        : (error as Error).message;
    await showToast({ title, style: Toast.Style.Failure });
  }
}
