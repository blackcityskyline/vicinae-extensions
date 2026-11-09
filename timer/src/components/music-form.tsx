import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useState } from "react";

export type Failure = { field: "name" | "link"; message: string };

type Props = {
  title: string;
  name: string;
  link: string;
  /** Editing one playlist starts in its links, adding one in the name. */
  focusLinks?: boolean;
  onSave: (name: string, link: string) => Failure | null;
};

/**
 * One playlist: its name and its own links, nothing else. The extension cannot
 * know what a link plays, so the name is typed here, not inferred. Nothing is
 * written until Save is pressed.
 */
export default function MusicForm({ title, name, link, focusLinks = false, onSave }: Props) {
  const [values, setValues] = useState({ name, link });
  const [failure, setFailure] = useState<Failure | null>(null);

  function submit(): boolean {
    const problem = onSave(values.name, values.link);
    setFailure(problem);
    return problem === null;
  }

  return (
    <Form
      navigationTitle={title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            icon={Icon.Check}
            shortcut="save"
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Anything you like, e.g. Rain on the roof"
        value={values.name}
        error={failure?.field === "name" ? failure.message : undefined}
        autoFocus={!focusLinks}
        onChange={(next) => {
          setValues((current) => ({ ...current, name: next }));
          setFailure(null);
        }}
      />
      <Form.TextArea
        id="link"
        title="Links"
        placeholder={"One per line, played in this order:\nhttps://…\n/home/you/rain.ogg"}
        value={values.link}
        error={failure?.field === "link" ? failure.message : undefined}
        autoFocus={focusLinks}
        onChange={(next) => {
          setValues((current) => ({ ...current, link: next }));
          setFailure(null);
        }}
      />
    </Form>
  );
}
