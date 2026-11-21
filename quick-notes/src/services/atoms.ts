import { atom } from "jotai";
import { atomWithReset, RESET } from "jotai/utils";
import { Icon } from "@vicinae/api";
import { DRAFTS_FILE_PATH, TAGS_FILE_PATH, notesDir } from "./config";
import { persistNotes, readJson, readNotes, writeJson } from "./notes-store";
import { getDeletedTags, getRandomColor, trashFiles } from "../utils/utils";

export interface Note {
  title: string;
  icon?: string;
  body: string;
  tags: string[];
  is_draft: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Filename in the notes folder; absent while the note is a draft. */
  file?: string;
}

export interface Tag {
  name: string;
  color: string;
}

export const sortOptions = {
  created: { title: "Created At", icon: Icon.Clock },
  updated: { title: "Updated At", icon: Icon.Pencil },
  alphabetical: { title: "Alphabetical", icon: Icon.Text },
  tags: { title: "Tags", icon: Icon.Tag },
} as const;

export type Sort = keyof typeof sortOptions;

/** The folder is the store; drafts wait in the support folder until they are saved. */
const loadNotes = (): Note[] => [
  ...readNotes(notesDir()),
  ...readJson<Note[]>(DRAFTS_FILE_PATH, []).map((draft) => ({
    ...draft,
    body: draft.body ?? "",
    tags: draft.tags ?? [],
    is_draft: true,
    file: undefined,
  })),
];

/** Tags typed into a markdown file by hand still need a colour in the pickers. */
const registerTags = (stored: Tag[], notes: Note[]): Tag[] => {
  const known = new Set(stored.map((tag) => tag.name));
  const missing = [...new Set(notes.flatMap((note) => note.tags))].filter((name) => !known.has(name));
  if (missing.length === 0) {
    return stored;
  }
  const merged = [...stored, ...missing.map((name) => ({ name, color: getRandomColor().name }))];
  writeJson(TAGS_FILE_PATH, merged);
  return merged;
};

const initialNotes = loadNotes();
const notes = atomWithReset<Note[]>(initialNotes);

export const notesAtom = atom(
  async (get) => get(notes),
  async (get, set, newNotes: Note[] | typeof RESET) => {
    if (newNotes === RESET) {
      set(notes, loadNotes());
      return;
    }
    const { notes: persisted, trash } = persistNotes(notesDir(), get(notes), newNotes);
    if (trash.length > 0) {
      try {
        await trashFiles(trash);
      } catch (error) {
        console.error(`Error trashing note files: ${error}`);
      }
    }
    writeJson(
      DRAFTS_FILE_PATH,
      persisted.filter((note) => note.is_draft),
    );
    set(notes, persisted);
  },
);

const tags = atom<Tag[]>(registerTags(readJson<Tag[]>(TAGS_FILE_PATH, []), initialNotes));

export const tagsAtom = atom(
  (get) => get(tags),
  (get, set, newTags: Tag[]) => {
    // Deleting a tag strips it from every note, and so from every file.
    const deletedTags = getDeletedTags(get(tags), newTags);
    if (deletedTags.length > 0) {
      const newNotes = get(notes).map((note) => ({
        ...note,
        tags: note.tags.filter((tag) => !deletedTags.some((t) => t.name === tag)),
      }));
      void set(notesAtom, newNotes);
    }
    set(tags, newTags);
    writeJson(TAGS_FILE_PATH, newTags);
  },
);
