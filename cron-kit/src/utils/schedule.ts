import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";

export type Described =
  | { ok: true; text: string; nextRuns: Date[] }
  | { ok: false; message: string };

/**
 * Aliases crontab accepts that cron-parser does not know, spelled the way
 * cron-parser would want them.
 *
 * `@reboot` is deliberately absent: it fires once at startup and has no next
 * run, so giving it one would be a lie.
 */
const ALIASES: Record<string, string> = {
  "@midnight": "@daily",
  "@annually": "@yearly",
  "@weekly": "0 0 * * 0",
};

function nextRuns(expression: string, count: number): Date[] {
  const schedule = ALIASES[expression] ?? expression;
  try {
    const interval = CronExpressionParser.parse(schedule);
    const runs: Date[] = [];
    for (let index = 0; index < count; index += 1) runs.push(interval.next().toDate());
    return runs;
  } catch {
    // @reboot lands here, and so does anything cronstrue is more willing to
    // accept than cron-parser. "No next run" is the honest answer for both.
    return [];
  }
}

/**
 * Describes a cron expression in English.
 *
 * cronstrue decides what is a valid expression here, but crontab is the
 * authority: it is stricter about some aliases and cronstrue has never heard of
 * fields some dialects accept. The write path asks crontab itself, and reports
 * whatever crontab says.
 */
export function describeSchedule(expression: string, count = 3): Described {
  const trimmed = expression.trim();

  let text: string;
  try {
    text = cronstrue.toString(trimmed);
  } catch {
    return {
      ok: false,
      message: "That is not a cron expression. Five fields, or an alias such as @daily or @reboot.",
    };
  }

  return { ok: true, text, nextRuns: nextRuns(trimmed, count) };
}
