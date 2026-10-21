import { Action, ActionPanel, Form, popToRoot, showHUD } from "@vicinae/api";
import { useMemo, useState } from "react";

import type { CrontabWrite } from "~/api/crontab";
import { hasRawPercent } from "~/utils/crontab";
import { quickSchedule } from "~/utils/quick";
import { describeSchedule } from "~/utils/schedule";

export const RUN_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

type Props = {
  navigationTitle: string;
  schedule?: string;
  command?: string;
  onSave: (schedule: string, command: string) => Promise<CrontabWrite>;
};

/**
 * Add or edit one job.
 *
 * crontab is asked to validate the result rather than a second parser: it is the
 * only authority on which aliases and field counts it takes, and its rejection
 * message is more useful than any message invented here.
 */
export default function JobForm({ navigationTitle, schedule = "", command = "", onSave }: Props) {
  const [values, setValues] = useState({ schedule, command });
  const [quick, setQuick] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const described = useMemo(() => describeSchedule(values.schedule), [values.schedule]);
  const rawPercent = hasRawPercent(values.command);
  const quickResult = useMemo(() => quickSchedule(quick), [quick]);
  const nextRuns = described.ok ? described.nextRuns : [];

  function field(name: keyof typeof values) {
    return (next: string) => {
      setValues((current) => ({ ...current, [name]: next }));
      setError("");
    };
  }

  async function submit(): Promise<boolean> {
    setBusy(true);
    const result = await onSave(values.schedule.trim(), values.command.trim());
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return false;
    }
    await showHUD("Crontab updated");
    await popToRoot();
    return true;
  }

  return (
    <Form
      navigationTitle={navigationTitle}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save to Crontab" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="quick"
        title="Quick"
        placeholder="5m · 09:30 · weekly mon 09:30"
        value={quick}
        onChange={(next) => {
          setQuick(next);
          const parsed = quickSchedule(next);
          if (!parsed.ok) return;
          setValues((current) => ({ ...current, schedule: parsed.schedule }));
          setError("");
        }}
      />
      <Form.Description
        title="Quick"
        text={
          quick.trim() === ""
            ? "5m, 2h, 09:30, weekdays 18:00, weekly mon 09:30, monthly 1 09:30. Fills the field below."
            : quickResult.ok
              ? `Schedule set to ${quickResult.schedule}`
              : "Not understood — the Schedule field is untouched."
        }
      />
      <Form.TextField
        id="schedule"
        title="Schedule"
        placeholder="*/5 * * * *"
        value={values.schedule}
        error={described.ok ? error : described.message}
        autoFocus
        onChange={field("schedule")}
      />
      <Form.TextField
        id="command"
        title="Command"
        placeholder="/usr/local/bin/thing --flag"
        value={values.command}
        error={error}
        onChange={field("command")}
      />
      {rawPercent && (
        <Form.Description
          title="Heads up"
          text="Cron splits the command on an unescaped %. Everything after it goes to the command's stdin, so `date +%s` runs as `date +`. Write \\% for a literal percent, or % for stdin on purpose."
        />
      )}
      <Form.Description title="In English" text={described.ok ? described.text : "—"} />
      {nextRuns.length > 0 && (
        <Form.Description title="Next Runs" text={nextRuns.map((run) => RUN_FORMAT.format(run)).join("  ·  ")} />
      )}
    </Form>
  );
}
