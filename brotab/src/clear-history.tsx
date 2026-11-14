import { Action, ActionPanel, Alert, confirmAlert, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState } from "react";

import { clearBrowsingData, deleteHistoryRange } from "~/lib/mediator";

/** The same periods Firefox offers, in milliseconds; `all` has no start. */
const PERIODS = [
  { value: "1h", title: "Last hour", span: 3_600_000 },
  { value: "24h", title: "Last 24 hours", span: 86_400_000 },
  { value: "7d", title: "Last 7 days", span: 604_800_000 },
  { value: "4w", title: "Last 4 weeks", span: 2_419_200_000 },
  { value: "all", title: "All history", span: 0 },
];

/**
 * Deleting history is the browser's job: it holds `places.sqlite` under an
 * exclusive lock, so the mediator asks the add-on, which calls
 * `history.deleteRange` and, when asked, `browsingData.remove`.
 */
export default function ClearHistory() {
  const [period, setPeriod] = useState("24h");
  const [cookies, setCookies] = useState(false);
  const [cache, setCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pop } = useNavigation();

  async function clear(): Promise<void> {
    const label = PERIODS.find((candidate) => candidate.value === period)?.title ?? period;
    const also = [cookies ? "cookies" : null, cache ? "cache" : null].filter((part) => part !== null);

    const confirmed = await confirmAlert({
      title: `Delete history for ${label.toLowerCase()}?`,
      message: `${also.length === 0 ? "Only history is deleted." : `History, ${also.join(" and ")} are deleted.`} This cannot be undone.`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const span = PERIODS.find((candidate) => candidate.value === period)?.span ?? 0;
      const since = span === 0 ? 0 : Date.now() - span;
      await deleteHistoryRange(since, Date.now() + 1_000);
      if (cookies || cache) await clearBrowsingData(since, { cookies, cache });
      await showToast({
        style: Toast.Style.Success,
        title: "Browsing data deleted",
        message: `${label}${also.length === 0 ? "" : `, ${also.join(" and ")}`}`,
      });
      pop();
    } catch (failure) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not delete it",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle="Clear History"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Delete History" icon={Icon.Trash} shortcut="remove-all" onSubmit={clear} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="period" title="Period" value={period} onChange={setPeriod}>
        {PERIODS.map((candidate) => (
          <Form.Dropdown.Item key={candidate.value} title={candidate.title} value={candidate.value} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="cookies"
        title="Cookies"
        label={`Delete the cookies from ${PERIODS.find((candidate) => candidate.value === period)?.title.toLowerCase() ?? period}`}
        value={cookies}
        onChange={setCookies}
      />
      <Form.Checkbox
        id="cache"
        title="Cache"
        label="Delete the cached files from the same period"
        value={cache}
        onChange={setCache}
      />
      <Form.Description text="History is deleted inside the browser, through the brotab add-on. Deleting cookies signs you out of the sites that set them." />
    </Form>
  );
}
