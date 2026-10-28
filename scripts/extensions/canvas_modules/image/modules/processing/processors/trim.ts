import sharp from "sharp";
import type { Processor } from "./types";
import { checkDimensions } from "./limits";
export const trim: Processor = async (c, p) => {
  const { data, info } = await sharp(c.image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let l = c.width,
    t = c.height,
    r = -1,
    b = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (data[(y * c.width + x) * info.channels + 3] > p.threshold) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
  if (r < 0) {
    c.warnings.push("完全透明图像：保持原样");
    return;
  }
  if (l === 0 && r === c.width - 1 && t === 0 && b === c.height - 1) {
    c.warnings.push("未发现可裁剪的透明边缘");
    return;
  }
  checkDimensions(
    r - l + 1 + Math.round(p.padding) * 2,
    b - t + 1 + Math.round(p.padding) * 2
  );
  let op = sharp(c.image).extract({
    left: l,
    top: t,
    width: r - l + 1,
    height: b - t + 1,
  });
  if (p.padding)
    op = op.extend({
      left: Math.round(p.padding),
      right: Math.round(p.padding),
      top: Math.round(p.padding),
      bottom: Math.round(p.padding),
      background: "#00000000",
    });
  return op;
};
