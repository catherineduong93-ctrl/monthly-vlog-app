import { db } from "./db";

export interface MediaItemRow {
  id: number;
  user_id: number;
  dropbox_file_id: string;
  month: string;
  caption: string | null;
  sort_order: number;
  include: number;
  created_at: string;
}

/**
 * Ensures every entry for this month has a row, without disturbing existing
 * captions/order/include flags for files already tracked. New files are
 * appended after the current max sort_order, in chronological order.
 */
export function syncMediaItems(
  userId: number,
  month: string,
  entries: { dropboxFileId: string }[]
) {
  const existingIds = new Set(
    (
      db
        .prepare(
          `SELECT dropbox_file_id FROM media_items WHERE user_id = ? AND month = ?`
        )
        .all(userId, month) as { dropbox_file_id: string }[]
    ).map((r) => r.dropbox_file_id)
  );

  const newEntries = entries.filter((e) => !existingIds.has(e.dropboxFileId));
  if (newEntries.length === 0) return;

  const { maxOrder } = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM media_items WHERE user_id = ? AND month = ?`
    )
    .get(userId, month) as { maxOrder: number };

  const insert = db.prepare(
    `INSERT OR IGNORE INTO media_items (user_id, dropbox_file_id, month, sort_order)
     VALUES (@userId, @dropboxFileId, @month, @sortOrder)`
  );

  const insertAll = db.transaction(
    (items: { dropboxFileId: string }[]) => {
      let nextOrder = maxOrder + 1;
      for (const item of items) {
        insert.run({
          userId,
          dropboxFileId: item.dropboxFileId,
          month,
          sortOrder: nextOrder++,
        });
      }
    }
  );
  insertAll(newEntries);
}

export function getMediaItems(userId: number, month: string): MediaItemRow[] {
  return db
    .prepare(
      `SELECT * FROM media_items WHERE user_id = ? AND month = ? ORDER BY sort_order ASC`
    )
    .all(userId, month) as MediaItemRow[];
}

export function updateMediaItem(
  userId: number,
  id: number,
  updates: { caption?: string | null; include?: boolean }
): MediaItemRow | undefined {
  const sets: string[] = [];
  const params: Record<string, unknown> = { userId, id };

  if ("caption" in updates) {
    sets.push("caption = @caption");
    params.caption = updates.caption;
  }
  if ("include" in updates) {
    sets.push("include = @include");
    params.include = updates.include ? 1 : 0;
  }
  if (sets.length === 0) {
    return db
      .prepare(`SELECT * FROM media_items WHERE id = ? AND user_id = ?`)
      .get(id, userId) as MediaItemRow | undefined;
  }

  db.prepare(
    `UPDATE media_items SET ${sets.join(", ")} WHERE id = @id AND user_id = @userId`
  ).run(params);

  return db
    .prepare(`SELECT * FROM media_items WHERE id = ? AND user_id = ?`)
    .get(id, userId) as MediaItemRow | undefined;
}

export function reorderMediaItems(userId: number, orderedIds: number[]) {
  const update = db.prepare(
    `UPDATE media_items SET sort_order = ? WHERE id = ? AND user_id = ?`
  );
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => update.run(index, id, userId));
  });
  tx(orderedIds);
}
