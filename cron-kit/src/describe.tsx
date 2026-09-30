import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useMemo, useState } from "react";

import { RUN_FORMAT } from "~/components/job-form";
import { describeSchedule } from "~/utils/schedule";

/**
 * Explains an expression without touching the crontab.
 *
 * cronstrue decides what is readable, crontab decides what is installable, and
 * the two do not fully agree — the write path asks crontab and reports whatever
 * it says.
 */
export default function DescribeCron() {
  const [expression, setExpression] = useState("*/5 * * * *");
  const described = useMemo(() => describeSchedule(expression), [expression]);
  const nextRuns = described.ok ? described.nextRuns : [];

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Description"
            icon={Icon.Text}
            content={described.ok ? described.text : ""}
          />
          <Action.CopyToClipboard title="Copy Expression" icon={Icon.CopyClipboard} content={expression} />
          <Action.CopyToClipboard
            title="Copy Next Run"
            icon={Icon.Clock}
            content={nextRuns[0] ? RUN_FORMAT.format(nextRuns[0]) : ""}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="expression"
        title="Cron Expression"
        placeholder="*/5 * * * *"
        value={expression}
        error={described.ok ? undefined : described.message}
        autoFocus
        onChange={setExpression}
      />
      <Form.Description title="In English" text={described.ok ? described.text : "—"} />
      {nextRuns.length > 0 && (
        <Form.Description title="Next Runs" text={nextRuns.map((run) => RUN_FORMAT.format(run)).join("  ·  ")} />
      )}
    </Form>
  );
}
