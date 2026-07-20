import { db } from "./db";

export type RenderStatus = "queued" | "downloading" | "rendering" | "done" | "error";

export interface RenderJobRow {
  id: number;
  user_id: number;
  month: string;
  status: RenderStatus;
  progress: string | null;
  output_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function createRenderJob(userId: number, month: string): RenderJobRow {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO render_jobs (user_id, month, status) VALUES (?, ?, 'queued')`
    )
    .run(userId, month);
  return getRenderJob(Number(lastInsertRowid))!;
}

export function getRenderJob(id: number): RenderJobRow | undefined {
  return db.prepare(`SELECT * FROM render_jobs WHERE id = ?`).get(id) as
    | RenderJobRow
    | undefined;
}

export function getLatestRenderJob(
  userId: number,
  month: string
): RenderJobRow | undefined {
  return db
    .prepare(
      `SELECT * FROM render_jobs WHERE user_id = ? AND month = ? ORDER BY id DESC LIMIT 1`
    )
    .get(userId, month) as RenderJobRow | undefined;
}

export function isRenderJobActive(job: RenderJobRow): boolean {
  return job.status === "queued" || job.status === "downloading" || job.status === "rendering";
}

export function updateRenderJob(
  id: number,
  updates: Partial<
    Pick<RenderJobRow, "status" | "progress" | "output_path" | "error">
  >
) {
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, unknown> = { id };

  for (const key of ["status", "progress", "output_path", "error"] as const) {
    if (key in updates) {
      sets.push(`${key} = @${key}`);
      params[key] = updates[key] ?? null;
    }
  }

  db.prepare(`UPDATE render_jobs SET ${sets.join(", ")} WHERE id = @id`).run(
    params
  );
}
