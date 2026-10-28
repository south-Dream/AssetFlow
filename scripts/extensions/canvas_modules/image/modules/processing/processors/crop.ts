import sharp from "sharp";
import type { Processor } from "./types";
export const crop: Processor = (c, p) => {
  for (const key of ["left", "top", "width", "height"])
    if (!Number.isInteger(p[key])) throw Error("裁剪坐标和尺寸必须是整数");
  if (p.left + p.width > c.width || p.top + p.height > c.height)
    throw Error(`裁剪范围超出图像 ${c.width}×${c.height}`);
  return sharp(c.image).extract({
    left: p.left,
    top: p.top,
    width: p.width,
    height: p.height,
  });
};
