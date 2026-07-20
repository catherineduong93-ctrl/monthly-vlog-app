import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  createRenderJob,
  getLatestRenderJob,
  isRenderJobActive,
} from "@/lib/renderJobs";
import { runRenderJob } from "@/lib/videoRender";

const MONTH_RE = /^\d{4}-\d{2}$/;

function serialize(job: NonNullable<ReturnType<typeof getLatestRenderJob>>) {
  return {
    id: job.id,
    month: job.month,
    status: job.status,
    progress: job.progress,
    error: job.error,
    outputPath: job.output_path,
    musicPath: job.music_path,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month || !MONTH_RE.test(month)) {
    return NextResponse.json(
      { error: "Invalid month, expected YYYY-MM." },
      { status: 400 }
    );
  }

  const job = getLatestRenderJob(config.defaultUserId, month);
  return NextResponse.json({ job: job ? serialize(job) : null });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const month = body.month;
  if (typeof month !== "string" || !MONTH_RE.test(month)) {
    return NextResponse.json(
      { error: "Invalid month, expected YYYY-MM." },
      { status: 400 }
    );
  }

  const userId = config.defaultUserId;

  const existing = getLatestRenderJob(userId, month);
  if (existing && isRenderJobActive(existing)) {
    return NextResponse.json({ job: serialize(existing) });
  }

  const job = createRenderJob(userId, month);
  // Fire and forget: the client polls GET /api/render?month= for progress.
  runRenderJob(job.id, userId, month).catch(() => {
    // runRenderJob already records failures on the job row itself.
  });

  return NextResponse.json({ job: serialize(job) });
}
