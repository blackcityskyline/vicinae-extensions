import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useState } from "react";

type Props = {
  text: string;
  /** Returns the problem to show, or null once the preset is written. */
  onSave: (text: string) => string | null;
};

/** One saved preset: the duration and its note, exactly as the search bar takes them. */
export default function PresetForm({ text, onSave }: Props) {
  const [value, setValue] = useState(text);
  const [failure, setFailure] = useState<string | null>(null);

  function submit(): boolean {
    const problem = onSave(value);
    setFailure(problem);
    return problem === null;
  }

  return (
    <Form
      navigationTitle="Edit Preset"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" icon={Icon.Check} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="preset"
        title="Preset"
        placeholder="5m Check laundry"
        value={value}
        error={failure ?? undefined}
        onChange={(next) => {
          setValue(next);
          setFailure(null);
        }}
      />
    </Form>
  );
}
