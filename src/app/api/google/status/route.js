// ...existing code...
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const redis = Redis.fromEnv();
const TOKEN_KEY_PREFIX = "google:drive:user:";

export async function GET(req) {
  // Get user sub from cookie
  const sub = req.cookies.get("google_drive_sub")?.value;
  if (!sub) {
    return NextResponse.json(
      { connected: false, reason: "missing_sub" },
      { status: 401 }
    );
  }

  // Check token in Redis
  const tokenInfo = await redis.hgetall(`${TOKEN_KEY_PREFIX}${sub}`);
  if (!tokenInfo || !tokenInfo.access_token) {
    return NextResponse.json(
      { connected: false, reason: "no_token" },
      { status: 401 }
    );
  }

  // Optionally check expiry
  const expiresIn = Number(tokenInfo.expires_in);
  const savedAt = Number(tokenInfo.saved_at);
  const expired = Date.now() > savedAt + expiresIn * 1000;
  if (expired) {
    return NextResponse.json(
      { connected: false, reason: "expired" },
      { status: 401 }
    );
  }

  return NextResponse.json({ connected: true });
}
