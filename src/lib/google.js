import { google } from "googleapis";

import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
const TOKEN_KEY_PREFIX = "google:drive:user:";

export async function getDriveClient(sub) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  // Lấy refresh_token từ Redis cho user
  let refresh_token = process.env.GOOGLE_REFRESH_TOKEN;
  if (sub) {
    const tokenInfo = await redis.hgetall(`${TOKEN_KEY_PREFIX}${sub}`);
    if (tokenInfo && tokenInfo.refresh_token) {
      refresh_token = tokenInfo.refresh_token;
    }
  }
  oauth2.setCredentials({ refresh_token });
  return google.drive({ version: "v3", auth: oauth2 });
}
