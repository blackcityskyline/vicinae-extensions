import {
  Action,
  ActionPanel,
  Icon,
  List,
  LocalStorage,
  Toast,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import { armTimer, cancelTimers, capability, liveTimers } from "~/api/systemd";
import { dueAt, formatClock, formatCountdown, parseSchedule, type ParsedSchedule } from "~/utils/schedule";
import {
  addHistory,
  decodeHistory,
  decodeSchedules,
  sortSchedules,
  type HistoryEvent,
  type PowerAction,
  type Schedule,
} from "~/utils/state";
import { classifyDisappearance, unitStem } from "~/utils/systemd";

const ACTIONS: PowerAction[] = ["poweroff", "reboot", "suspend"];
const LABELS: Record<PowerAction, string> = { poweroff: "Power off", reboot: "Reboot", suspend: "Suspend" };
const ICONS: Record<PowerAction, Icon> = { poweroff: Icon.Power, reboot: Icon.RotateClockwise, suspend: Icon.Moon };
const HISTORY_LIMIT = 10;
const SCHEDULES_KEY = "schedules";
const HISTORY_KEY = "history";

function labelOf(action: string): string {
  return LABELS[action as PowerAction] ?? action;
}

function positiveSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function formatMoment(epochSec: number): string {
  const date = new Date(epochSec * 1000);
  return `${date.getMonth() + 1}/${date.getDate()} ${formatClock(date.getTime())}`;
}

export default function TimerCommand() {
  const prefs = getPreferenceValues<Preferences.Timer>();
  const dryRun = prefs.dryRun === true;
  const earlySeconds = positiveSeconds(prefs.earlyMinutes, 5) * 60;
  const finalSeconds = positiveSeconds(prefs.finalSeconds, 30);

  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void refresh();
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  async function persist(nextSchedules: Schedule[], nextHistory: HistoryEvent[]): Promise<void> {
    await Promise.all([
      LocalStorage.setItem(SCHEDULES_KEY, JSON.stringify(nextSchedules)),
      LocalStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)),
    ]);
  }

  async function refresh(): Promise<void> {
    try {
      const [storedSchedules, storedHistory] = await Promise.all([
        LocalStorage.getItem<string>(SCHEDULES_KEY),
        LocalStorage.getItem<string>(HISTORY_KEY),
      ]);
      let nextSchedules = sortSchedules(decodeSchedules(storedSchedules ?? null));
      let nextHistory = decodeHistory(storedHistory ?? null);

      // Units vanish from the timer list either because they fired or because
      // something outside the extension stopped them; the deadline says which.
      const live = await liveTimers();
      if (live.error !== undefined) {
        if (nextSchedules.length > 0) {
          await showToast(Toast.Style.Failure, "Could not read the systemd timers", live.error.message);
        }
      } else if (nextSchedules.length > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        const stillArmed: Schedule[] = [];
        for (const schedule of nextSchedules) {
          if (live.result?.includes(unitStem("action", schedule.id)) === true) {
            stillArmed.push(schedule);
            continue;
          }
          nextHistory = addHistory(
            nextHistory,
            {
              at: nowSec,
              action: schedule.action,
              outcome: classifyDisappearance(schedule.dueEpochSec, nowSec),
              detail: `was due ${formatClock(schedule.dueEpochSec * 1000)}`,
            },
            HISTORY_LIMIT,
          );
        }
        if (stillArmed.length !== nextSchedules.length) {
          nextSchedules = stillArmed;
          await persist(nextSchedules, nextHistory);
        }
      }

      setSchedules(nextSchedules);
      setHistory(nextHistory);
      setLoaded(true);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Could not read the saved timers", String(error));
      setLoaded(true);
    }
  }

  async function arm(action: PowerAction): Promise<void> {
    try {
      const parsed = parseSchedule(search).schedule;
      if (parsed === undefined) return;

      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const dueMs = dueAt(parsed, nowMs);
      const dueSec = Math.ceil(dueMs / 1000);
      // Second-resolution id: the stem is the unit name, so two arms in the same
      // second collide on it and systemd refuses the second one by name.
      const id = nowSec;
      const secondsFromNow = dueSec - nowSec;
      const label = LABELS[action];

      const allowed = await capability(action);
      if (allowed.error !== undefined) {
        await showToast(Toast.Style.Failure, `Cannot ${label.toLowerCase()}`, allowed.error.message);
        return;
      }
      if (allowed.result?.allowed !== true) {
        await showToast(Toast.Style.Failure, `Cannot ${label.toLowerCase()}`, allowed.result?.reason ?? "logind refused the action");
        return;
      }

      const request = { id, action, secondsFromNow, dryRun };
      const armed = await armTimer({ ...request, role: "action" });
      if (armed.error !== undefined) {
        await showToast(Toast.Style.Failure, "Could not arm the timer", armed.error.message);
        return;
      }

      // The action is armed; a failed warning must not undo that, so it only reports.
      if (earlySeconds > 0 && earlySeconds < secondsFromNow) {
        const warning = await armTimer({ ...request, role: "early", earlySeconds });
        if (warning.error !== undefined) {
          await showToast(Toast.Style.Failure, "Early warning failed", warning.error.message);
        }
      }
      if (finalSeconds > 0 && finalSeconds < secondsFromNow) {
        const warning = await armTimer({ ...request, role: "final", finalSeconds });
        if (warning.error !== undefined) {
          await showToast(Toast.Style.Failure, "Final warning failed", warning.error.message);
        }
      }

      const record: Schedule = { id, action, dueEpochSec: dueSec, armedAtSec: nowSec, dryRun };
      const nextSchedules = sortSchedules([...schedules, record]);
      const nextHistory = addHistory(
        history,
        { at: nowSec, action, outcome: "armed", detail: `at ${formatClock(dueMs)}` },
        HISTORY_LIMIT,
      );
      await persist(nextSchedules, nextHistory);
      setSchedules(nextSchedules);
      setHistory(nextHistory);
      setSearch("");
      await showToast(
        Toast.Style.Success,
        `${label} armed`,
        `in ${formatCountdown(dueMs - nowMs)} — at ${formatClock(dueMs)}${dryRun ? " (dry run)" : ""}`,
      );
    } catch (error) {
      await showToast(Toast.Style.Failure, "Could not arm the timer", String(error));
    }
  }

  async function cancel(schedule: Schedule): Promise<void> {
    try {
      const stems = (["action", "early", "final"] as const).map((role) => unitStem(role, schedule.id));
      const live = await liveTimers();
      if (live.error !== undefined) {
        await showToast(Toast.Style.Failure, "Could not read the systemd timers", live.error.message);
        return;
      }
      const ours = (live.result ?? []).filter((stem) => stems.includes(stem));
      if (ours.length > 0) {
        const stopped = await cancelTimers(ours);
        if (stopped.error !== undefined) {
          await showToast(Toast.Style.Failure, "Could not cancel the timer", stopped.error.message);
          return;
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const nextSchedules = schedules.filter((entry) => entry.id !== schedule.id);
      const nextHistory = addHistory(
        history,
        {
          at: nowSec,
          action: schedule.action,
          outcome: ours.length > 0 ? "cancelled" : classifyDisappearance(schedule.dueEpochSec, nowSec),
          detail: `was due ${formatClock(schedule.dueEpochSec * 1000)}`,
        },
        HISTORY_LIMIT,
      );
      await persist(nextSchedules, nextHistory);
      setSchedules(nextSchedules);
      setHistory(nextHistory);
      await showToast(Toast.Style.Success, `${LABELS[schedule.action]} cancelled`);
    } catch (error) {
      await showToast(Toast.Style.Failure, "Could not cancel the timer", String(error));
    }
  }

  const parsed: ParsedSchedule | undefined = search.trim() === "" ? undefined : parseSchedule(search);
  const dueMs = parsed?.schedule === undefined ? undefined : dueAt(parsed.schedule, now);
  const filtering = dueMs === undefined && search.trim() !== "";
  const needle = search.trim().toLowerCase();
  const matches = (text: string) => !filtering || text.toLowerCase().includes(needle);

  const visibleSchedules = schedules.filter((entry) => {
    const text = `${LABELS[entry.action]} at ${formatClock(entry.dueEpochSec * 1000)}`;
    return matches(text);
  });
  const visibleHistory = history.filter((event) => matches(`${labelOf(event.action)} ${event.outcome} ${event.detail ?? ""}`));

  const emptyDescription =
    search.trim() === ""
      ? "Nothing armed yet. Type a time — 30, 45m, 1h30m or 23:30 — then choose Power off, Reboot or Suspend."
      : [parsed?.error, `Nothing matches "${search.trim()}".`].filter(Boolean).join(" ");

  return (
    <List
      isLoading={!loaded}
      searchBarPlaceholder="Time to arm: 30, 45m, 1h30m, 23:30 — or search"
      onSearchTextChange={setSearch}
    >
      {dueMs !== undefined && (
        <List.Section title="Arm">
          {ACTIONS.map((action) => (
            <List.Item
              key={action}
              id={`arm-${action}`}
              icon={ICONS[action]}
              title={`${LABELS[action]} at ${formatClock(dueMs)}`}
              subtitle={`in ${formatCountdown(dueMs - now)}`}
              actions={
                <ActionPanel>
                  <Action title={`Arm ${LABELS[action]}`} icon={ICONS[action]} onAction={() => void arm(action)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {visibleSchedules.length > 0 && (
        <List.Section title="Armed">
          {visibleSchedules.map((schedule) => (
            <List.Item
              key={schedule.id}
              id={`timer-${schedule.id}`}
              icon={ICONS[schedule.action]}
              title={`${LABELS[schedule.action]} at ${formatClock(schedule.dueEpochSec * 1000)}`}
              subtitle={`in ${formatCountdown(schedule.dueEpochSec * 1000 - now)}`}
              accessories={schedule.dryRun ? [{ tag: "dry run" }] : undefined}
              actions={
                <ActionPanel>
                  <Action title={`Cancel ${LABELS[schedule.action]}`} icon={Icon.Stop} onAction={() => void cancel(schedule)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {visibleHistory.length > 0 && (
        <List.Section title="History">
          {visibleHistory.map((event, index) => (
            <List.Item
              key={`${event.at}-${index}`}
              icon={Icon.Clock}
              title={`${labelOf(event.action)} — ${event.outcome.charAt(0).toUpperCase()}${event.outcome.slice(1)}`}
              subtitle={`${formatMoment(event.at)}${event.detail === undefined ? "" : ` · ${event.detail}`}`}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy"
                    content={`${labelOf(event.action)} ${event.outcome} at ${formatMoment(event.at)}`}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {loaded && dueMs === undefined && visibleSchedules.length === 0 && visibleHistory.length === 0 && (
        <List.EmptyView
          icon={search.trim() === "" ? Icon.Alarm : Icon.MagnifyingGlass}
          title={search.trim() === "" ? "No timers" : `Nothing matches "${search.trim()}"`}
          description={emptyDescription}
        />
      )}
    </List>
  );
}
