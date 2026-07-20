import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDropboxAuthUrl } from "@/lib/dropboxClient";

export const STATE_COOKIE = "dropbox_oauth_state";

export async function GET() {
  const state = randomUUID();
  let authUrl: string;
  try {
    authUrl = await getDropboxAuthUrl(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
