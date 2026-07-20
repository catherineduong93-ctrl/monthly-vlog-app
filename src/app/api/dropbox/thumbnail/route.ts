import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getThumbnail } from "@/lib/dropboxClient";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  try {
    const { data, contentType } = await getThumbnail(
      config.defaultUserId,
      path
    );
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        // Thumbnails for a given Dropbox file rarely change; let the
        // browser cache them instead of re-fetching on every render.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
