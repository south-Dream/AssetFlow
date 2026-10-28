import sharp from "sharp";
import type { Processor } from "./types";
import { checkDimensions } from "./limits";
export const resize: Processor = (c, p) => {
  let width = p.width,
    height = p.height;
  if (p.mode === "percent") {
    width = Math.max(1, Math.round((c.width * p.percent) / 100));
    height = Math.max(1, Math.round((c.height * p.percent) / 100));
  }
  if (p.mode === "max") width = height = p.max;
  const ratio = Math.min(width / c.width, height / c.height);
  if (p.mode === "fit" || p.mode === "max")
    checkDimensions(
      Math.max(1, Math.round(c.width * ratio)),
      Math.max(1, Math.round(c.height * ratio))
    );
  else checkDimensions(width, height);
  return sharp(c.image).resize({
    width: Math.round(width),
    height: Math.round(height),
    fit: p.mode === "exact" || p.mode === "percent" ? "fill" : "inside",
    withoutEnlargement: !p.enlarge,
    kernel: p.kernel,
  });
};
