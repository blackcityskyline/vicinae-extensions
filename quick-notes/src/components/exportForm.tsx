import { Form, ActionPanel, Action, Icon, popToRoot, showToast, useNavigation, Toast } from "@vicinae/api";
import { exportNotes, getTintColor } from "../utils/utils";
import fs from "node:fs";
import { useAtom } from "jotai";
import { asSubmitHandler } from "../utils/form";
import { notesAtom } from "../services/atoms";

export default function ExportForm() {
  const [notes] = useAtom(notesAtom);
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={"Export Notes"}
            icon={{
              source: Icon.Download,
              tintColor: getTintColor("green"),
            }}
            onSubmit={asSubmitHandler(async (values: Form.Values) => {
              if (notes.length === 0) {
                showToast({ title: "No Notes to Export", message: "Ctrl + N for new note", style: Toast.Style.Failure });
                pop();
                return;
              }
              const folder = (values.folders as string[] | undefined)?.[0];
              if (!folder || !fs.existsSync(folder) || !fs.lstatSync(folder).isDirectory()) {
                return false;
              }
              await exportNotes(folder, notes);
              showToast({ title: "Notes Exported" });
              popToRoot();
            })}
          />
        </ActionPanel>
      }
    >
      {notes.length === 0 && <Form.Description text="No notes to export. Create a new note before exporting." />}
      <Form.FilePicker
        id="folders"
        title="Choose Export Folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        info="Choose a folder to export all your notes into"
      />
    </Form>
  );
}
