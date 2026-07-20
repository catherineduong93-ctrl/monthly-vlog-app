import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { listConfiguredFolder } from "@/lib/dropboxClient";

export async function GET() {
  try {
    const entries = await listConfiguredFolder(config.defaultUserId);
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
