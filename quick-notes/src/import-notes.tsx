import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from "@vicinae/api";
import { useAtom } from "jotai";
import { RESET } from "jotai/utils";
import { notesAtom } from "./services/atoms";
import { notesDir } from "./services/config";
import { asSubmitHandler } from "./utils/form";
import { getTintColor } from "./utils/utils";
import fs from "node:fs";
import path from "node:path";

/** `Idea.md` and `Idea (1).md`, so an import never overwrites a note already there. */
const availableName = (dir: string, file: string): string => {
  const taken = new Set(fs.readdirSync(dir).map((entry) => entry.toLowerCase()));
  if (!taken.has(file.toLowerCase())) {
    return file;
  }
  const base = path.basename(file, ".md");
  let i = 1;
  while (taken.has(`${base} (${i}).md`.toLowerCase())) {
    i++;
  }
  return `${base} (${i}).md`;
};

export default function ImportNotes() {
  const [, setNotes] = useAtom(notesAtom);

  return (
    <Form
      navigationTitle="Import Notes"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import Notes"
            icon={{ source: Icon.Download, tintColor: getTintColor("green") }}
            onSubmit={asSubmitHandler(async (values: Form.Values) => {
              const files = (values.files as string[] | undefined) ?? [];
              const markdownFiles = files.filter((file) => file.toLowerCase().endsWith(".md"));
              if (markdownFiles.length === 0) {
                showToast({
                  style: Toast.Style.Failure,
                  title: "No Markdown Files",
                  message: "Only .md files can be imported",
                });
                return;
              }

              const dir = notesDir();
              fs.mkdirSync(dir, { recursive: true });
              const imported: string[] = [];
              const failed: string[] = [];
              for (const file of markdownFiles) {
                try {
                  const target = path.join(dir, availableName(dir, path.basename(file)));
                  if (target === file) {
                    continue;
                  }
                  fs.copyFileSync(file, target);
                  imported.push(path.basename(target));
                } catch {
                  failed.push(path.basename(file));
                }
              }

              await setNotes(RESET);

              const warnings = [
                failed.length > 0 ? `${failed.length} file${failed.length > 1 ? "s" : ""} could not be copied` : "",
              ].filter(Boolean);
              showToast({
                style: imported.length > 0 ? Toast.Style.Success : Toast.Style.Failure,
                title:
                  imported.length > 0
                    ? `${imported.length} Note${imported.length > 1 ? "s" : ""} Imported`
                    : "Nothing Imported",
                message: warnings.join(", ") || `Copied into ${dir}`,
              });
              popToRoot();
            })}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="Choose Markdown Files"
        info="Only .md files are copied into your notes folder"
        allowMultipleSelection
      />
    </Form>
  );
}
