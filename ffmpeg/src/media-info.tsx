import { Action, ActionPanel, Clipboard, Form, Icon, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { probe, ProbeError } from "~/api/probe";
import { MediaDetail } from "~/components/media-detail";
import { clipboardFile } from "~/utils/files";

export default function MediaInfo() {
  const navigation = useNavigation();
  const [file, setFile] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // `FilePicker` is the input Vicinae has: there is no Finder selection to read.
  useEffect(() => {
    void Clipboard.readText().then((text) => {
      const found = clipboardFile(text);
      if (found !== undefined) setFile(found);
    });
  }, []);

  async function submit(): Promise<boolean> {
    if (file === "") {
      setError("Choose a media file first.");
      return false;
    }

    setError(undefined);
    setBusy(true);
    try {
      const result = await probe(file);
      navigation.push(<MediaDetail file={file} probe={result} />);
      return true;
    } catch (failure) {
      setError(failure instanceof ProbeError ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle="Media Info"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Show Info" icon={Icon.MagnifyingGlass} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="Media File"
        allowMultipleSelection={false}
        canChooseFiles
        canChooseDirectories={false}
        value={file === "" ? [] : [file]}
        error={error}
        onChange={(paths) => {
          setFile(paths[0] ?? "");
          setError(undefined);
        }}
      />
    </Form>
  );
}
