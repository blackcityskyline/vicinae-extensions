import { Icon } from "@vicinae/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Tag } from "../services/atoms";
import { marked } from "marked";
import striptags from "striptags";

export const isMacOS = process.platform === "darwin";

const execFileAsync = promisify(execFile);

/** Vicinae's `trash()` is a plain rm; gio writes a .trashinfo record instead. */
export const trashFiles = async (paths: string[]): Promise<void> => {
  if (paths.length === 0) return;
  await execFileAsync("gio", ["trash", ...paths]);
};

export const getDeletedTags = (oldTags: Tag[], newTags: Tag[]): Tag[] => {
  const newTagNames = new Set(newTags.map((tag) => tag.name));
  return oldTags.filter((tag) => !newTagNames.has(tag.name));
};

export const colors = [
  {
    name: "red",
    value: "0",
    tintColor: "hsl(0, 100%, 68%)",
  },
  {
    name: "orange",
    value: "18",
    tintColor: "hsl(18, 94%, 68%)",
  },
  {
    name: "amber",
    value: "42",
    tintColor: "hsl(42, 82%, 57%)",
  },
  {
    name: "yellow",
    value: "56",
    tintColor: "hsl(56, 73%, 45%)",
  },
  {
    name: "lime",
    value: "80",
    tintColor: "hsl(80, 79%, 43%)",
  },
  {
    name: "green",
    value: "152",
    tintColor: "hsl(152, 96%, 38%)",
  },
  {
    name: "turquoise",
    value: "180",
    tintColor: "hsl(180, 100%, 39%)",
  },
  {
    name: "sky",
    value: "198",
    tintColor: "hsl(198, 100%, 50%)",
  },
  {
    name: "blue",
    value: "220",
    tintColor: "hsl(220, 100%, 64%)",
  },
  {
    name: "indigo",
    value: "252",
    tintColor: "hsl(252, 100%, 67%)",
  },
  {
    name: "purple",
    value: "270",
    tintColor: "hsl(270, 100%, 65%)",
  },
  {
    name: "pink",
    value: "320",
    tintColor: "hsl(320, 100%, 59%)",
  },
];

export const getRandomColor = () => {
  return colors[Math.floor(Math.random() * colors.length)] ?? colors[0]!;
};

export const getTintColor = (colorName?: string) => {
  if (!colorName) return undefined;
  return colors.find((c) => c.name === colorName)?.tintColor;
};

export const getIcon = (iconName?: string) => {
  if (!iconName) return undefined;
  return Icon[iconName as keyof typeof Icon];
};

export const countWords = (markdownString: string): number => {
  const htmlString = marked.parse(markdownString, { async: false });
  const plainText = striptags(htmlString as string);
  const words = plainText
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  return words.length;
};
