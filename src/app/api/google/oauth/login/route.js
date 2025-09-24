import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${base}/api/google/oauth/callback`;

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/drive.readonly"
  );
  // 2 tham số sau đảm bảo NHẬN refresh_token
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");

  return NextResponse.redirect(auth.toString());
}
