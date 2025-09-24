import { JOB_DONE, JOB_QUEUE, JOB_TOTAL, redis } from "@/lib/redis";
import { NextResponse } from "next/server";

export async function GET() {
  const [done, total, remaining] = await Promise.all([
    redis.get(JOB_DONE).then((n) => Number(n || 0)),
    redis.get(JOB_TOTAL).then((n) => Number(n || 0)),
    redis.llen(JOB_QUEUE).then((n) => Number(n || 0)),
  ]);
  const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
  return NextResponse.json({ total, processed: done, remaining, percent });
}
