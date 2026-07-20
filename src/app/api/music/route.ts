import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { listMusicFolder } from "@/lib/dropboxClient";
import { isAudioFile } from "@/lib/mediaKind";

export async function GET() {
  if (config.dropbox.musicFolderPath() === null) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const entries = await listMusicFolder(config.defaultUserId);
    const tracks = entries
      .filter((e) => e.kind === "file" && e.pathLower && isAudioFile(e.name))
      .map((e) => ({ path: e.pathLower as string, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
