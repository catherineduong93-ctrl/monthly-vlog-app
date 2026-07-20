import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

declare global {
  var __vlogDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const dbPath = config.db.path();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS dropbox_tokens (
      user_id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      account_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      dropbox_file_id TEXT NOT NULL,
      month TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL,
      include INTEGER NOT NULL DEFAULT 1,
      keep_full INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, dropbox_file_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_items_user_month
      ON media_items (user_id, month);

    CREATE TABLE IF NOT EXISTS render_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress TEXT,
      output_path TEXT,
      music_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_render_jobs_user_month
      ON render_jobs (user_id, month);
  `);

  return db;
}

// Reuse one connection across Next.js dev hot-reloads instead of opening a
// new file handle on every request.
export const db = globalThis.__vlogDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__vlogDb = db;
}
