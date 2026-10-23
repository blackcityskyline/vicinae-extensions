import {
  Action,
  ActionPanel,
  Form,
  Toast,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useState } from "react";

import { savePreset } from "../api/presets";
import { showErrorToast } from "../ui/toasts";

export function SavePresetForm(props: {
  suggestedName: string;
  members: string[];
  memberLabels: string[];
  volumePercent: number;
}) {
  const { suggestedName, members, memberLabels, volumePercent } = props;
  const { pop } = useNavigation();
  const [name, setName] = useState(suggestedName);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      await showToast({
        style: Toast.Style.Failure,
        title: "A preset needs a name",
      });
      return;
    }

    try {
      await savePreset({ name: trimmed, members, volumePercent });
      await showToast({
        style: Toast.Style.Success,
        title: "Preset saved",
        message: `${trimmed} · ${volumePercent}%`,
      });
      pop();
    } catch (error) {
      await showErrorToast({ title: "Failed to save the preset", error });
    }
  }

  return (
    <Form
      navigationTitle="Save Output Preset"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Preset" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Preset Name"
        value={name}
        onChange={setName}
        info="Saving under an existing name replaces that preset."
      />
      <Form.Description
        title="Outputs"
        text={memberLabels.length ? memberLabels.join(" + ") : members.join(", ")}
      />
      <Form.Description title="Volume" text={`${volumePercent}%`} />
    </Form>
  );
}
