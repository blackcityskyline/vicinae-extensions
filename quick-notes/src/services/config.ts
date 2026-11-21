import { environment, getPreferenceValues } from "@vicinae/api";
import { homedir } from "node:os";
import path from "node:path";
import { expandHome } from "./notes-store";

export const TAGS_FILE_PATH = path.join(environment.supportPath, "tags.json");
export const DRAFTS_FILE_PATH = path.join(environment.supportPath, "drafts.json");

export const preferences = getPreferenceValues();

/** The markdown folder is the store; `~/Documents/Notes/Quick` unless the preference says otherwise. */
export const notesDir = (): string => expandHome(preferences.fileLocation?.trim() || "~/Documents/Notes/Quick", homedir());
