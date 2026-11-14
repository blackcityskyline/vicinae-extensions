import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { ensureStateDir, notesFile } from "~/lib/browser";
import type { Page } from "~/lib/places";

export type Note = {
  url: string;
  body: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
};

const CREATE = `CREATE TABLE IF NOT EXISTS note (
  url        TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

function open(file: string): DatabaseSync {
  ensureStateDir(file);
  const database = new DatabaseSync(file);
  database.exec(CREATE);
  return database;
}

/** One row per page URL, in the database `brotab-ng` keeps beside this one. */
export function setNote(url: string, body: string, file = notesFile()): Note {
  const database = open(file);
  try {
    const updatedAt = Date.now();
    database
      .prepare(
        `INSERT INTO note (url, body, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .run(url, body, updatedAt);
    return { url, body, updatedAt };
  } finally {
    database.close();
  }
}

export function getNote(url: string, file = notesFile()): Note | null {
  if (!existsSync(file)) return null;
  const database = open(file);
  try {
    return (database.prepare(`SELECT url, body, updated_at AS updatedAt FROM note WHERE url = ?`).get(url) as Note) ?? null;
  } finally {
    database.close();
  }
}

/** A page of notes, newest edit first, optionally filtered by URL or body. */
export function notesPage(query = "", file = notesFile(), limit = 50, offset = 0): Page<Note> {
  if (!existsSync(file)) return { items: [], hasMore: false };
  const database = open(file);
  try {
    const text = query.trim();
    const pattern = `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const filter = text === "" ? "" : `WHERE url LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'`;
    const params = text === "" ? [] : [pattern, pattern];

    const rows = database
      .prepare(
        `SELECT url, body, updated_at AS updatedAt FROM note
          ${filter}
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, offset) as Note[];

    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  } finally {
    database.close();
  }
}

export function removeNote(url: string, file = notesFile()): boolean {
  if (!existsSync(file)) return false;
  const database = open(file);
  try {
    return database.prepare(`DELETE FROM note WHERE url = ?`).run(url).changes > 0;
  } finally {
    database.close();
  }
}
