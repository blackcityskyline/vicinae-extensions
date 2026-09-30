import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Detail,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import { readCrontab, updateCrontab } from "~/api/crontab";
import JobForm, { RUN_FORMAT } from "~/components/job-form";
import { addJob, isJob, parseCrontab, removeJob, replaceJob, type CrontabLine } from "~/utils/crontab";
import { describeSchedule } from "~/utils/schedule";

type Job = { line: CrontabLine & { kind: "job" }; index: number };

function jobOf(line: CrontabLine, index: number): Job | null {
  return isJob(line) ? { line, index } : null;
}

function describe(line: CrontabLine): string {
  if (!isJob(line)) return "";
  const described = describeSchedule(line.schedule);
  return described.ok ? described.text : "Not a valid cron expression";
}

function nextRun(schedule: string): string {
  const described = describeSchedule(schedule);
  const next = described.ok ? described.nextRuns[0] : undefined;
  return next ? RUN_FORMAT.format(next) : "—";
}

export default function Crontab() {
  const [lines, setLines] = useState<CrontabLine[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const result = await readCrontab();
    if (result.ok) {
      setLines(parseCrontab(result.value));
    } else {
      setError(result.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(schedule: string, command: string, target?: string) {
    if (!schedule || !command) {
      return { ok: false as const, message: "A job needs both a schedule and a command." };
    }
    const result = await updateCrontab((current) => {
      if (!target) return addJob(current, schedule, command);
      const index = current.findIndex((line) => line.text === target);
      if (index === -1) return { error: "That job is no longer in your crontab. Nothing was changed." };
      return replaceJob(current, index, schedule, command);
    });
    if (result.ok) await load();
    return result;
  }

  async function remove(target: string) {
    const confirmed = await confirmAlert({
      title: "Remove this cron job?",
      message: target,
      primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
    });
    if (!confirmed) return;

    const result = await updateCrontab((current) => {
      const index = current.findIndex((line) => line.text === target);
      if (index === -1) return { error: "That job is no longer in your crontab. Nothing was changed." };
      return removeJob(current, index);
    });

    if (result.ok) {
      await showHUD("Job removed");
      await load();
    } else {
      await showToast({ style: Toast.Style.Failure, title: "Could not remove the job", message: result.message });
    }
  }

  if (error) {
    return (
      <Detail
        markdown={`## Could not read your crontab\n\n\`crontab -l\` did not work, so nothing is shown and nothing can be changed — writing a crontab that failed to read would replace all of your jobs with an empty one.\n\n${error}`}
      />
    );
  }

  const jobs = (lines ?? []).map(jobOf).filter((job): job is Job => job !== null);

  const addAction = (
    <Action.Push
      title="Add Job"
      icon={Icon.Plus}
      target={<JobForm navigationTitle="Add Cron Job" onSave={(schedule, command) => save(schedule, command)} />}
    />
  );

  return (
    <List isLoading={lines === null}>
      {jobs.length === 0 && lines !== null ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No cron jobs"
          description="Press return to add one, or run crontab -e to write the first entry by hand."
          actions={
            <ActionPanel>
              {addAction}
              <Action.RunInTerminal
                title="Edit Crontab by Hand"
                icon={Icon.Terminal}
                shortcut={{ modifiers: ["cmd"], key: "e" }}
                args={["crontab", "-e"]}
              />
            </ActionPanel>
          }
        />
      ) : (
        jobs.map((job) => (
          <List.Item
            key={job.index}
            icon={Icon.Clock}
            title={job.line.command}
            subtitle={describe(job.line)}
            keywords={[job.line.schedule, describe(job.line), nextRun(job.line.schedule)]}
            accessories={[
              { text: job.line.schedule },
              { text: nextRun(job.line.schedule), tooltip: "Next run" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Edit Job"
                  icon={Icon.Pencil}
                  target={
                    <JobForm
                      navigationTitle="Edit Cron Job"
                      schedule={job.line.schedule}
                      command={job.line.command}
                      onSave={(schedule, command) => save(schedule, command, job.line.text)}
                    />
                  }
                />
                <Action
                  title="Remove Job"
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                  onAction={() => remove(job.line.text)}
                />
                <Action.CopyToClipboard title="Copy Job Line" content={job.line.text} />
                <Action.CopyToClipboard title="Copy Command" content={job.line.command} />
                {addAction}
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
