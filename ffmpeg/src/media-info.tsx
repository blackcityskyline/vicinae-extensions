import { Action, ActionPanel, Clipboard, Form, Icon, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { FileList } from "~/components/file-list";
import { clipboardFile } from "~/utils/files";

export default function MediaInfo() {
  const navigation = useNavigation();
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  // `FilePicker` is the input Vicinae has: there is no Finder selection to read.
  useEffect(() => {
    void Clipboard.readText().then((text) => {
      const found = clipboardFile(text);
      if (found !== undefined) setFiles([found]);
    });
  }, []);

  function submit(): boolean {
    if (files.length === 0) {
      setError("Choose a media file first.");
      return false;
    }

    setError(undefined);
    navigation.push(<FileList files={files} />);
    return true;
  }

  return (
    <Form
      navigationTitle="Media Info"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Inspect Files" icon={Icon.MagnifyingGlass} shortcut="save" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="Media Files"
        allowMultipleSelection
        canChooseFiles
        canChooseDirectories={false}
        value={files}
        error={error}
        onChange={(paths) => {
          setFiles(paths);
          setError(undefined);
        }}
      />
    </Form>
  );
}
