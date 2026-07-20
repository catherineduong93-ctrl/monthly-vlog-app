import { NextRequest, NextResponse } from "next/server";
import { getRenderJob } from "@/lib/renderJobs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const job = getRenderJob(id);
  if (!job) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      month: job.month,
      status: job.status,
      progress: job.progress,
      error: job.error,
      outputPath: job.output_path,
    },
  });
}
