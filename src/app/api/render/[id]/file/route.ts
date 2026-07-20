import fs from "node:fs";
import { Readable } from "node:stream";
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
  if (!job || job.status !== "done" || !job.output_path) {
    return NextResponse.json({ error: "Render not ready." }, { status: 404 });
  }

  const stat = await fs.promises.stat(job.output_path).catch(() => null);
  if (!stat) {
    return NextResponse.json({ error: "Rendered file missing." }, { status: 404 });
  }

  const range = request.headers.get("range");
  const fileName = `monthly-vlog-${job.month}.mp4`;

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(job.output_path, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  }

  const stream = fs.createReadStream(job.output_path);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
