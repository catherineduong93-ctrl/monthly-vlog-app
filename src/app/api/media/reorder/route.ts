import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { reorderMediaItems } from "@/lib/mediaItems";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const ids = body.ids;

  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) {
    return NextResponse.json(
      { error: "Expected { ids: number[] }." },
      { status: 400 }
    );
  }

  reorderMediaItems(config.defaultUserId, ids);
  return NextResponse.json({ ok: true });
}
