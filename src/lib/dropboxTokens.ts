import { db } from "./db";

export interface DropboxTokenRow {
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_id: string | null;
}

export function saveTokens(
  userId: number,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    accountId?: string | null;
  }
) {
  db.prepare(
    `INSERT INTO dropbox_tokens (user_id, access_token, refresh_token, expires_at, account_id, updated_at)
     VALUES (@userId, @accessToken, @refreshToken, @expiresAt, @accountId, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       access_token = excluded.access_token,
       -- Dropbox only issues a refresh_token on the very first authorization,
       -- so keep the existing one on subsequent token refreshes.
       refresh_token = COALESCE(excluded.refresh_token, dropbox_tokens.refresh_token),
       expires_at = excluded.expires_at,
       account_id = COALESCE(excluded.account_id, dropbox_tokens.account_id),
       updated_at = datetime('now')`
  ).run({
    userId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    accountId: tokens.accountId ?? null,
  });
}

export function getTokens(userId: number): DropboxTokenRow | undefined {
  return db
    .prepare(`SELECT * FROM dropbox_tokens WHERE user_id = ?`)
    .get(userId) as DropboxTokenRow | undefined;
}

export function updateAccessToken(
  userId: number,
  accessToken: string,
  expiresAt: number
) {
  db.prepare(
    `UPDATE dropbox_tokens SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(accessToken, expiresAt, userId);
}
