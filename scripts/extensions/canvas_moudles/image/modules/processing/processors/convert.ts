import type { Processor } from "./types";
// Encode once, after all image operations, to avoid repeated lossy compression.
export const convert: Processor = (c, p) => {
  c.format = p.format;
  c.quality = p.quality;
  c.background = p.background;
};
