import sharp from "sharp";
import type { Processor } from "./types";
import { checkDimensions } from "./limits";
export const rotate: Processor = (c, p) => {
  const angle = (p.angle * Math.PI) / 180;
  checkDimensions(
    Math.ceil(
      Math.abs(c.width * Math.cos(angle)) +
        Math.abs(c.height * Math.sin(angle)) -
        1e-8
    ),
    Math.ceil(
      Math.abs(c.width * Math.sin(angle)) +
        Math.abs(c.height * Math.cos(angle)) -
        1e-8
    )
  );
  let op = sharp(c.image).rotate(p.angle, {
    background: p.transparent ? "#00000000" : p.background,
  });
  if (p.horizontal) op = op.flop();
  if (p.vertical) op = op.flip();
  return op;
};
