import { Action, ActionPanel, List, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";

import {
  cancelWorkflowRun,
  listViewerRepositories,
  listWorkflowRuns,
  rerunWorkflowRun,
} from "~/api/github";
import type { WorkflowRun } from "~/api/github";
import ListEmptyView from "~/components/ListEmptyView";
import { relativeTime } from "~/utils/format";
import { Icon } from "~/utils/icons";

/** GitHub's conclusions plus the in-flight states, mapped to real icons. */
const STATUS_ICON = {
  success: Icon.CheckCircle,
  failure: Icon.Warning,
  cancelled: Icon.MinusCircle,
  skipped: Icon.MinusCircle,
  timed_out: Icon.Clock,
  queued: Icon.Clock,
  waiting: Icon.Clock,
  requested: Icon.Clock,
  in_progress: Icon.ArrowClockwise,
  completed: Icon.Checkmark,
} as const;

function statusIcon(run: WorkflowRun) {
  const key = run.status === "completed" ? (run.conclusion ?? "completed") : run.status;
  return STATUS_ICON[key as keyof typeof STATUS_ICON] ?? Icon.QuestionMark;
}

/**
 * Workflow runs for a repository, with the actions that control them.
 *
 * Cancel and rerun are the operations worth having on the keyboard, so they are
 * inline actions here rather than the separate menu-bar commands the upstream
 * extension used, which could not work on Linux at all.
 */
export default function WorkflowRuns() {
  const [repository, setRepository] = useState("");

  const { data: repositories } = useCachedPromise(
    () => listViewerRepositories("collaborator", "pushed", 1),
    [],
  );

  const [owner = "", name = ""] = repository.split("/");
  const hasRepository = owner !== "" && name !== "";


  const { data, isLoading, error, mutate, pagination } = useCachedPromise(
    (target: string) => async (options: { page: number }) => {
      const [repoOwner = "", repoName = ""] = target.split("/");
      const result = await listWorkflowRuns(repoOwner, repoName, { page: options.page + 1 });
      return { data: result.workflow_runs, hasMore: result.workflow_runs.length > 0 };
    },
    [repository],
    { execute: hasRepository, keepPreviousData: true },
  );

  const runs = useMemo(() => data ?? [], [data]);

  /** Run a control action, then refresh. Failures surface rather than vanish. */
  async function control(action: () => Promise<void>) {
    try {
      await action();
      await mutate();
    } catch (controlError) {
      await showToast({ title: (controlError as Error).message, style: Toast.Style.Failure });
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter runs by workflow, branch or event"
      searchBarAccessory={
        <List.Dropdown tooltip="Repository" value={repository} onChange={setRepository}>
          {(repositories ?? []).map((item) => (
            <List.Dropdown.Item
              key={item.id}
              value={item.full_name}
              title={item.full_name}
              icon={item.owner.avatar_url}
            />
          ))}
        </List.Dropdown>
      }
      pagination={pagination}
    >
      {runs.length > 0 ? (
        <List.Section title="Workflow Runs" subtitle={String(runs.length)}>
          {runs.map((run) => (
            <List.Item
              key={run.id}
              title={`${run.name ?? "workflow"} #${run.run_number}`}
              subtitle={`${run.head_branch} · ${run.event} · ${relativeTime(run.created_at)}`}
              keywords={[run.name ?? "", run.head_branch, run.event, run.status, run.conclusion ?? ""]}
              icon={statusIcon(run)}
              accessories={[
                { text: run.status, tooltip: "Status" },
                { text: run.conclusion ?? "", tooltip: "Conclusion" },
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title="Open in Browser" url={run.html_url} />

                  {run.status === "completed" ? (
                    <>
                      <Action
                        title="Rerun"
                        icon={Icon.ArrowClockwise}
                        shortcut={{ modifiers: ["cmd"], key: "r" }}
                        onAction={async () => {
                          await control(() => rerunWorkflowRun(owner, name, run.id, false));
                        }}
                      />
                      {run.conclusion === "failure" ? (
                        <Action
                          title="Rerun Failed Jobs"
                          icon={Icon.ArrowCounterClockwise}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                          onAction={async () => {
                            await control(() => rerunWorkflowRun(owner, name, run.id, true));
                          }}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Action
                      title="Cancel Run"
                      icon={Icon.MinusCircle}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                      onAction={async () => {
                        await control(() => cancelWorkflowRun(owner, name, run.id));
                      }}
                    />
                  )}

                  <Action.CopyToClipboard title="Copy Run URL" icon={Icon.Link} content={run.html_url} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.Git}
          title={hasRepository ? "No workflow runs" : "Choose a repository"}
          description={
            hasRepository
              ? "This repository has no runs yet, or the token cannot see its Actions."
              : "Pick a repository from the dropdown to list its workflow runs."
          }
        />
      )}
    </List>
  );
}
