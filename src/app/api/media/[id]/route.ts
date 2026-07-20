import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { updateMediaItem } from "@/lib/mediaItems";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const body = await request.json();
  const updates: { caption?: string | null; include?: boolean } = {};
  if ("caption" in body) updates.caption = body.caption;
  if ("include" in body) updates.include = !!body.include;

  const updated = updateMediaItem(config.defaultUserId, id, updates);
  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    caption: updated.caption,
    include: !!updated.include,
  });
}
