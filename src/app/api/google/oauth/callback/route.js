import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code)
    return NextResponse.json({ error: "missing code" }, { status: 400 });

  const tokenEndpoint = "https://oauth2.googleapis.com/token";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${url.protocol}//${url.host}/api/google/oauth/callback`;

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const r = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await r.json();

  if (!r.ok) {
    return NextResponse.json({ error: j }, { status: 500 });
  }

  // j.refresh_token CHÍNH LÀ thứ bạn cần copy vào .env.local
  // In ra cho nhanh (chỉ dev). Prod thì lưu Redis/DB.
  const to = new URL("/ingest", url);
  to.searchParams.set("google", j.refresh_token ? "connected" : "no_refresh");
  const sub = j.sub || "unknown"; // Assuming sub is obtained from the response
  // Lưu token vào Redis
  try {
    const { access_token, refresh_token, expires_in } = j;
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();
    const TOKEN_KEY_PREFIX = "google:drive:user:";
    await redis.hset(`${TOKEN_KEY_PREFIX}${sub}`, {
      access_token: access_token || "",
      refresh_token: refresh_token || "",
      expires_in: String(expires_in || 0),
      saved_at: String(Date.now()),
    });
  } catch (e) {
    // Có thể log lỗi nếu cần
  }
  const res = NextResponse.redirect(to);
  res.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });
  // Set user sub cookie for status API
  res.cookies.set("google_drive_sub", sub, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 3600, // 7 days
    path: "/",
  });
  return res;
}
