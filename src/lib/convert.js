import bmp from "bmp-js";
import sharp from "sharp";

export async function bmpToTiffBuffer(bmpBuffer) {
  const { data: bmpData, width, height } = bmp.decode(bmpBuffer);
  const out = await sharp(bmpData, {
    raw: {
      width: width,
      height: height,
      channels: 4,
    },
  })
    .tiff({ compression: "none" })
    .toBuffer();
  return out;
}
