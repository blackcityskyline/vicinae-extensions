import { Action, ActionPanel, Form, Icon, useNavigation } from "@vicinae/api";

import { IMPACTS, type Impact } from "~/api/feed";
import { NO_FILTERS, isFiltered, type Filters } from "~/utils/filters";

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
