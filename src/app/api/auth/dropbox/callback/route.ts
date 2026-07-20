import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { exchangeCodeForTokens } from "@/lib/dropboxClient";
import { STATE_COOKIE } from "../login/route";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code) {
    return NextResponse.json(
      { error: "Missing code from Dropbox redirect." },
      { status: 400 }
    );
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { error: "OAuth state mismatch. Please try connecting again." },
      { status: 400 }
    );
  }

  try {
    await exchangeCodeForTokens(code, config.defaultUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const response = NextResponse.redirect(new URL("/?connected=1", request.url));
  response.cookies.delete(STATE_COOKIE);
  return response;
}
