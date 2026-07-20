import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { isDropboxConnected } from "@/lib/dropboxClient";

export async function GET() {
  return NextResponse.json({
    connected: isDropboxConnected(config.defaultUserId),
    folderPath: config.dropbox.folderPath() || "/ (root)",
  });
}
