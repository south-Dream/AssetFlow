import sharp from "sharp";
import type { Processor } from "./types";
import { checkDimensions } from "./limits";
export const canvas: Processor = (c, p) => {
  let left: number, right: number, top: number, bottom: number;
  if (p.mode === "padding") {
    left = right = top = bottom = Math.round(p.padding);
  } else {
    const dx = Math.round(p.width) - c.width,
      dy = Math.round(p.height) - c.height;
    if (dx < 0 || dy < 0) throw Error("目标画布不能小于图片");
    left = p.position.includes("west")
      ? 0
      : p.position.includes("east")
      ? dx
      : Math.floor(dx / 2);
    top = p.position.includes("north")
      ? 0
      : p.position.includes("south")
      ? dy
      : Math.floor(dy / 2);
    right = dx - left;
    bottom = dy - top;
  }
  checkDimensions(c.width + left + right, c.height + top + bottom);
  return sharp(c.image).extend({
    left,
    right,
    top,
    bottom,
    background: p.transparent ? "#00000000" : p.background,
  });
};
