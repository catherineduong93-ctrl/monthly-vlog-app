import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { listConfiguredFolder } from "@/lib/dropboxClient";
import { classifyByName } from "@/lib/mediaKind";
import { getMediaItems, syncMediaItems } from "@/lib/mediaItems";

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? currentMonth();

  if (!MONTH_RE.test(month)) {
    return NextResponse.json(
      { error: "Invalid month, expected YYYY-MM." },
      { status: 400 }
    );
  }

  try {
    const userId = config.defaultUserId;
    const allEntries = await listConfiguredFolder(userId);

    const monthEntries = allEntries
      .filter((e) => e.kind === "file" && e.clientModified?.startsWith(month))
      .filter((e) => classifyByName(e.name) !== null)
      .sort((a, b) =>
        (a.clientModified ?? "").localeCompare(b.clientModified ?? "")
      );

    syncMediaItems(
      userId,
      month,
      monthEntries.map((e) => ({ dropboxFileId: e.id }))
    );

    const entryById = new Map(monthEntries.map((e) => [e.id, e]));
    const rows = getMediaItems(userId, month);

    const items = rows
      .map((row) => {
        const entry = entryById.get(row.dropbox_file_id);
        if (!entry) return null;
        return {
          id: row.id,
          dropboxFileId: row.dropbox_file_id,
          name: entry.name,
          pathLower: entry.pathLower,
          kind: classifyByName(entry.name),
          clientModified: entry.clientModified,
          caption: row.caption,
          sortOrder: row.sort_order,
          include: !!row.include,
          keepFull: !!row.keep_full,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({ month, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
