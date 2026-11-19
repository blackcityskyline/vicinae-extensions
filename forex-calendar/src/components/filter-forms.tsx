import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";

import { IMPACTS, type Impact } from "~/api/feed";
import { MAX_MONTHS } from "~/api/load";
import { NO_FILTERS, isFiltered, type Filters } from "~/utils/filters";
import { monthsOf, type Range } from "~/utils/select";

const IMPACT_LABEL: Record<Impact, string> = {
  High: "High (red)",
  Medium: "Medium (orange)",
  Low: "Low (yellow)",
  Holiday: "Holiday (grey)",
};

type FormProps = { filters: Filters; onApply: (filters: Filters) => void };

function CurrencyForm({ available, filters, onApply }: FormProps & { available: string[] }) {
  const { pop } = useNavigation();
  const chosen = filters.currencies.length === 0 ? available : filters.currencies;

  return (
    <Form
      navigationTitle="Currencies"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply"
            icon={Icon.Check}
            shortcut="save"
            onSubmit={(values) => {
              const picked = available.filter((code) => values[code] === true);
              // Every box ticked is the same as no restriction, and keeps new currencies visible.
              onApply({ ...filters, currencies: picked.length === available.length ? [] : picked });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Tick the currencies to show. Events for every market always show. Leave all unticked to show every currency." />
      {available.map((code) => (
        <Form.Checkbox key={code} id={code} label={code} defaultValue={chosen.includes(code)} />
      ))}
    </Form>
  );
}

function ImpactForm({ filters, onApply }: FormProps) {
  const { pop } = useNavigation();
  const chosen = filters.impacts.length === 0 ? IMPACTS : filters.impacts;

  return (
    <Form
      navigationTitle="Impact"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply"
            icon={Icon.Check}
            shortcut="save"
            onSubmit={(values) => {
              const picked = IMPACTS.filter((level) => values[level] === true);
              onApply({ ...filters, impacts: picked.length === IMPACTS.length ? [] : picked });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Tick the impact levels to show. Leave all unticked to show every level." />
      {IMPACTS.map((level) => (
        <Form.Checkbox key={level} id={level} label={IMPACT_LABEL[level]} defaultValue={chosen.includes(level)} />
      ))}
    </Form>
  );
}

/** The three filter actions, for every row and empty view, since a List has no panel of its own. */
export function FilterActions({ available, filters, onApply }: FormProps & { available: string[] }) {
  return (
    <ActionPanel.Section title="Filters">
      <Action.Push
        title="Choose Currencies"
        icon={Icon.Coins}
        shortcut={{ modifiers: ["ctrl"], key: "u" }}
        target={<CurrencyForm available={available} filters={filters} onApply={onApply} />}
      />
      <Action.Push
        title="Choose Impact"
        icon={Icon.Gauge}
        shortcut={{ modifiers: ["ctrl"], key: "i" }}
        target={<ImpactForm filters={filters} onApply={onApply} />}
      />
      {isFiltered(filters) ? (
        <Action
          title="Clear Filters"
          icon={Icon.XMarkCircle}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "u" }}
          onAction={() => onApply(NO_FILTERS)}
        />
      ) : null}
    </ActionPanel.Section>
  );
}

const DAY_MS = 86_400_000;

function RangeForm({ range, onApply }: { range: Range | undefined; onApply: (range: Range) => void }) {
  const { pop } = useNavigation();
  const today = new Date();
  const defaultFrom = range ? new Date(range[0]) : today;
  // The stored end is the start of the day after the last one shown.
  const defaultTo = range ? new Date(range[1] - DAY_MS) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);

  return (
    <Form
      navigationTitle="Custom Range"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Show Range"
            icon={Icon.Check}
            shortcut="save"
            onSubmit={(values) => {
              const from = values.from as Date | null;
              const to = values.to as Date | null;
              if (!from || !to) {
                void showToast({ style: Toast.Style.Failure, title: "Pick both days" });
                return;
              }
              const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
              const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
              if (end <= start) {
                void showToast({ style: Toast.Style.Failure, title: "The last day is before the first" });
                return;
              }
              const months = monthsOf(start, end).length;
              if (months > MAX_MONTHS) {
                void showToast({ style: Toast.Style.Failure, title: `At most ${MAX_MONTHS} months at a time`, message: `This range spans ${months}` });
                return;
              }
              onApply([start, end]);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Both days are included. Each month in the range is one page read from ForexFactory, up to ${MAX_MONTHS} months.`} />
      <Form.DatePicker id="from" title="From" type={Form.DatePicker.Type.Date} defaultValue={defaultFrom} />
      <Form.DatePicker id="to" title="To" type={Form.DatePicker.Type.Date} defaultValue={defaultTo} />
    </Form>
  );
}

/** Choosing the days of the custom range; the range itself lives in the view, since it is not worth keeping. */
export function RangeAction({ range, onApply }: { range: Range | undefined; onApply: (range: Range) => void }) {
  return (
    <ActionPanel.Section title="Range">
      <Action.Push
        title="Choose Dates"
        icon={Icon.Calendar}
        shortcut={{ modifiers: ["ctrl"], key: "g" }}
        target={<RangeForm range={range} onApply={onApply} />}
      />
    </ActionPanel.Section>
  );
}
