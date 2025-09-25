import { getLightroomAlbums } from "@/lib/lightroom";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    // Lấy sub từ cookie (giống các API khác)
    const sub = req.cookies.get("adobe_lr_sub")?.value;
    if (!sub)
      return NextResponse.json({ error: "missing_sub" }, { status: 400 });
    const albums = await getLightroomAlbums(sub);
    return NextResponse.json({ albums });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "Failed to fetch albums" },
      { status: 500 }
    );
  }
}
