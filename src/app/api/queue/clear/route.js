import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Lấy tất cả key bắt đầu bằng jobs:
    const keys = await redis.keys("jobs:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return NextResponse.json({ cleared: keys.length });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "clear failed" },
      { status: 500 }
    );
  }
}
