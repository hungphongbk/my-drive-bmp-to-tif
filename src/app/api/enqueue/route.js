import { getFolderId, listAllBmpRecursively } from "@/lib/drive";
import { getDriveClient } from "@/lib/google";
import { JOB_DONE, JOB_QUEUE, JOB_TOTAL, redis } from "@/lib/redis";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { folderUrl } = await req.json();
    if (!folderUrl)
      return NextResponse.json(
        { error: "folderUrl required" },
        { status: 400 }
      );

    const folderId = getFolderId(folderUrl);
    if (!folderId)
      return NextResponse.json(
        { error: "Invalid Drive folder URL" },
        { status: 400 }
      );

    // Lấy sub từ cookie
    const sub = req.cookies.get("google_drive_sub")?.value;
    const drive = await getDriveClient(sub);
    const files = await listAllBmpRecursively(drive, folderId);
    if (!files.length)
      return NextResponse.json({ message: "No BMP files found", total: 0 });

    await redis.set(JOB_TOTAL, files.length);
    await redis.set(JOB_DONE, 0);

    const jobs = files.map((f) =>
      JSON.stringify({
        fileId: f.id,
        fileName: f.name,
        mimeType: "image/bmp",
        parentPath: f.parentPath,
      })
    );
    await redis.lpush(JOB_QUEUE, ...jobs);

    return NextResponse.json({ message: "Enqueued", total: files.length });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "enqueue failed" },
      { status: 500 }
    );
  }
}
