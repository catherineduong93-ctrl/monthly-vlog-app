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
  `);

  return db;
}

// Reuse one connection across Next.js dev hot-reloads instead of opening a
// new file handle on every request.
export const db = globalThis.__vlogDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__vlogDb = db;
}
