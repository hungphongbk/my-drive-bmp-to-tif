import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const redis = Redis.fromEnv();
const TOKEN_KEY_PREFIX = "adobe:lr:user:";

async function exchangeCodeForTokens(code) {
  const basic = Buffer.from(
    `${process.env.ADOBE_CLIENT_ID}:${process.env.ADOBE_CLIENT_SECRET}`
  ).toString("base64");
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", process.env.ADOBE_REDIRECT_URI);

  const resp = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!resp.ok)
    throw new Error(
      `Token exchange failed: ${resp.status} ${await resp.text()}`
    );
  return resp.json();
}

async function fetchUserInfo(accessToken) {
  const url = new URL("https://ims-na1.adobelogin.com/ims/userinfo/v2");
  url.searchParams.set("client_id", process.env.ADOBE_CLIENT_ID);
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok)
    throw new Error(`userinfo failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    const to = new URL("/ingest", url); // <- absolute
    to.searchParams.set("adobe", "error");
    to.searchParams.set("reason", err);
    return NextResponse.redirect(to);
  }
  if (!code) {
    const to = new URL("/ingest", url);
    to.searchParams.set("adobe", "error");
    to.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(to);
  }

  const cookieState = req.cookies.get("adobe_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    const to = new URL("/ingest", url);
    to.searchParams.set("adobe", "error");
    to.searchParams.set("reason", "bad_state");
    return NextResponse.redirect(to);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const info = await fetchUserInfo(tokens.access_token);
    const sub = info.sub || tokens.sub || "unknown";

    await redis.hset(`${TOKEN_KEY_PREFIX}${sub}`, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "",
      expires_in: String(tokens.expires_in),
      saved_at: String(Date.now()),
    });

    const resTo = new URL("/ingest", url); // <- absolute
    resTo.searchParams.set("adobe", "connected");

    const res = NextResponse.redirect(resTo);
    res.cookies.set("adobe_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // localhost cần false
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    // Set user sub cookie for status API
    res.cookies.set("adobe_lr_sub", sub, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 3600, // 7 days
      path: "/",
    });
    return res;
  } catch (e) {
    const errTo = new URL("/ingest", url); // <- absolute
    errTo.searchParams.set("adobe", "error");
    errTo.searchParams.set(
      "reason",
      String(e.message || "token_exchange_failed")
    );

    const res = NextResponse.redirect(errTo);
    res.cookies.set("adobe_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  }
}
