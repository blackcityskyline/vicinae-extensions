import {
  ActionPanel,
  Action,
  Icon,
  Clipboard,
  showToast,
  Toast,
  open,
  Keyboard,
  Color,
  openExtensionPreferences,
} from "@vicinae/api";
import { notesDir } from "../services/config";
import { noteFileName } from "../services/notes-store";
import CreateEditNoteForm from "./createEditNoteForm";
import CreateEditTagForm from "./createEditTagForm";
import DeleteAllNotesAction from "./deleteAllNotesAction";
import DeleteNoteAction from "./deleteNoteAction";
import { getTintColor } from "../utils/utils";
import { notesAtom, Sort, sortOptions, tagsAtom } from "../services/atoms";
import { useAtom } from "jotai";
import { useCachedState } from "@raycast/utils";
import path from "node:path";

const Actions = ({
  noNotes,
  isDraft = false,
  title,
  icon,
  note,
  tags,
  createdAt,
}: {
  noNotes: boolean;
  isDraft?: boolean;
  title?: string;
  icon?: string;
  note?: string;
  tags?: string[];
  createdAt?: Date;
}) => {
  const [allTags] = useAtom(tagsAtom);
  const [notes, setNotes] = useAtom(notesAtom);
  const [, setMenu] = useCachedState("menu", false);
  const [sort, setSort] = useCachedState<Sort>("sort", "updated");

  if (noNotes) {
    return (
      <ActionPanel>
        <Action.Push
          title="New Note"
          icon={{ source: Icon.PlusSquare, tintColor: getTintColor("green") }}
          target={<CreateEditNoteForm isDraft={true} />}
          shortcut={Keyboard.Shortcut.Common.New}
        />
        <Action
          title="Open Extension Preferences"
          icon={{ source: Icon.Cog, tintColor: getTintColor("indigo") }}
          onAction={openExtensionPreferences}
          shortcut={{ modifiers: ["ctrl", "alt"], key: "," }}
        />
      </ActionPanel>
    );
  }

  const toggleTag = (tag: string) => {
    const current = notes.find((n) => n.createdAt === createdAt);
    if (!current) {
      return;
    }
    const nextTags = current.tags.includes(tag) ? current.tags.filter((t) => t !== tag) : [...current.tags, tag];
    setNotes(notes.map((n) => (n.createdAt === createdAt ? { ...n, tags: nextTags } : n)));
  };

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {!noNotes && (
          <>
            <Action.Push
              title="Edit Note"
              icon={{ source: Icon.Pencil, tintColor: getTintColor("sky") }}
              target={
                <CreateEditNoteForm
                  isDraft={isDraft}
                  title={title}
                  icon={icon}
                  note={note}
                  tags={tags}
                  createdAt={createdAt}
                />
              }
              shortcut={Keyboard.Shortcut.Common.Edit}
            />
            <Action
              title="Copy Note"
              icon={{ source: Icon.CopyClipboard, tintColor: getTintColor("turquoise") }}
              shortcut={Keyboard.Shortcut.Common.Copy}
              onAction={() => {
                Clipboard.copy(note ?? "").then(() => {
                  showToast({ style: Toast.Style.Success, title: "Note Copied" });
                });
              }}
            />
            <Action
              title="Open Note Externally"
              icon={{ source: Icon.Folder, tintColor: getTintColor("turquoise") }}
              shortcut={Keyboard.Shortcut.Common.Open}
              onAction={async () => {
                if (!title) {
                  return;
                }
                const notePath = path.join(notesDir(), noteFileName(title));
                try {
                  await open(notePath);
                } catch {
                  await showToast({ style: Toast.Style.Failure, title: "Failed to Open Note", message: notePath });
                }
              }}
            />
          </>
        )}
        <Action.Push
          title="New Note"
          icon={{ source: Icon.PlusSquare, tintColor: getTintColor("green") }}
          target={<CreateEditNoteForm isDraft={true} />}
          shortcut={Keyboard.Shortcut.Common.New}
        />
        {!noNotes && <DeleteNoteAction createdAt={createdAt} />}
        {!noNotes && <DeleteAllNotesAction />}
      </ActionPanel.Section>
      <ActionPanel.Section>
        {allTags && allTags.length > 0 ? (
          <ActionPanel.Submenu
            title="Apply / Remove Tag"
            icon={{ source: Icon.Tag, tintColor: getTintColor("turquoise") }}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
          >
            {allTags.map((tag, i) => (
              <Action
                key={i}
                icon={{ source: "dot.png", tintColor: getTintColor(tag.color) ?? "blue" }}
                title={tag.name}
                onAction={() => toggleTag(tag.name)}
              />
            ))}
          </ActionPanel.Submenu>
        ) : undefined}
        <Action.Push
          title="New Tag"
          icon={{ source: Icon.PlusSquare, tintColor: getTintColor("turquoise") }}
          target={<CreateEditTagForm />}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "n" }}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title="Toggle Info Panel"
          icon={{ source: Icon.AppWindowSidebarRight, tintColor: getTintColor("indigo") }}
          onAction={() => setMenu((prev) => !prev)}
          shortcut={{ modifiers: ["ctrl"], key: "i" }}
        />
        <ActionPanel.Submenu
          title="Sort"
          icon={{ source: Icon.Filter, tintColor: getTintColor("indigo") }}
          shortcut={Keyboard.Shortcut.Common.Save}
        >
          {(Object.keys(sortOptions) as Sort[]).map((key) => {
            const option = sortOptions[key];
            return (
              <Action
                key={key}
                icon={{ source: option.icon, tintColor: key === sort ? Color.Green : undefined }}
                title={option.title}
                onAction={() => setSort(key)}
              />
            );
          })}
        </ActionPanel.Submenu>
        <Action
          title="Open Extension Preferences"
          icon={{ source: Icon.Cog, tintColor: getTintColor("indigo") }}
          onAction={openExtensionPreferences}
          shortcut={{ modifiers: ["ctrl", "alt"], key: "," }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
};

export default Actions;
