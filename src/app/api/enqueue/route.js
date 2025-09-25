import { getFolderId, listAllBmpRecursively } from "@/lib/drive";
import { getDriveClient } from "@/lib/google";
import { JOB_DONE, JOB_QUEUE, JOB_TOTAL, redis } from "@/lib/redis";
import { NextResponse } from "next/server";
import fetch from "node-fetch";

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
    // Lấy access token từ drive client
    const accessToken = drive?._options?.auth?.credentials?.access_token;
    const files = await listAllBmpRecursively(drive, folderId);
    if (!files.length)
      return NextResponse.json({ message: "No BMP files found", total: 0 });

    await redis.set(JOB_TOTAL, files.length);
    await redis.set(JOB_DONE, 0);

    // Fetch thumbnailLink về buffer, encode base64
    async function fetchThumbnailBase64(url) {
      if (!url) return null;
      try {
        const res = await fetch(url, {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        // Google trả về image/jpeg cho thumbnail
        const base64 = Buffer.from(buf).toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      } catch {
        return null;
      }
    }

    const filesWithThumb = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        name: f.name,
        folder: f.parentPath,
        thumbnail: f.thumbnail ? await fetchThumbnailBase64(f.thumbnail) : null,
        folderId: folderId,
      }))
    );

    const jobs = files.map((f) =>
      JSON.stringify({
        fileId: f.id,
        fileName: f.name,
        mimeType: "image/bmp",
        parentPath: f.parentPath,
      })
    );
    await redis.lpush(JOB_QUEUE, ...jobs);

    return NextResponse.json({
      message: "Enqueued",
      total: files.length,
      files: filesWithThumb,
      folderId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "enqueue failed" },
      { status: 500 }
    );
  }
}
