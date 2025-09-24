import { NextResponse } from "next/server";
import crypto from "node:crypto";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const authorize = new URL("https://ims-na1.adobelogin.com/ims/authorize/v2");
  authorize.searchParams.set("client_id", process.env.ADOBE_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", process.env.ADOBE_REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set(
    "scope",
    (process.env.ADOBE_SCOPES || "").replace(/,/g, " ")
  );
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("adobe_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
