import { bmpToTiffBuffer } from "@/lib/convert";
import { downloadFileStream } from "@/lib/drive";
import { getDriveClient } from "@/lib/google";
import { uploadToLightroom } from "@/lib/lightroom";
import { JOB_DONE, JOB_QUEUE, redis } from "@/lib/redis";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(req) {
  const raw = await redis.rpop(JOB_QUEUE);
  if (!raw)
    return NextResponse.json({ status: "idle", message: "No jobs in queue" });

  // Nếu raw là object thì dùng luôn, nếu là string thì parse
  const job = typeof raw === "string" ? JSON.parse(raw) : raw;

  try {
    const sub = req.cookies.get("google_drive_sub")?.value;

    const drive = await getDriveClient(sub);
    const bmpStream = await downloadFileStream(drive, job.fileId);
    // Log thông tin buffer và file
    console.log(
      "[PROCESS] file:",
      job.fileName,
      "size:",
      bmpStream?.length,
      "parentPath:",
      job.parentPath
    );
    // Nếu có thể, log thêm kiểu dữ liệu
    // if (bmpStream && bmpStream.slice && typeof bmpStream[0] === "number") {
    //   console.log("[PROCESS] buffer head:", bmpStream.slice(0, 16));
    // }
    const tiffBuffer = await bmpToTiffBuffer(bmpStream);

    const lr = await uploadToLightroom({
      tiffBuffer,
      fileNameNoExt: job.fileName.replace(/\.bmp$/i, ""),
      parentPath: job.parentPath,
    });

    await redis.incr(JOB_DONE);

    return NextResponse.json({ status: "done", file: job.fileName, lr });
  } catch (e) {
    // Log trace lỗi
    console.error("[PROCESS ERROR]", e);
    // retry nhẹ: đẩy lại vào queue
    await redis.lpush(JOB_QUEUE, raw);
    return NextResponse.json(
      { status: "retry", error: e.message || "process failed", trace: e.stack },
      { status: 500 }
    );
  }
}
