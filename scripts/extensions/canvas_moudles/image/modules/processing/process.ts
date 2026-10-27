import sharp from "sharp";
import path from "node:path";
import type { Step } from "../../../../sdk/processing";
import { validateSteps } from "./catalog";
import { processingRegistry } from "./processors/index";
import type { Context } from "./processors/types";
export async function processImage(
  file: string,
  input: Step[],
  index = 0,
  check = () => {}
) {
  const steps = validateSteps(input);
  const original = await sharp(file, {
    limitInputPixels: 100_000_000,
  }).metadata();
  let image = await sharp(file, { limitInputPixels: 100_000_000 })
    .rotate()
    .ensureAlpha()
    .png()
    .toBuffer();
  let format =
    original.format === "jpeg"
      ? "jpeg"
      : original.format === "webp"
      ? "webp"
      : "png";
  let quality = 90;
  let background = "#ffffff";
  let name = path.parse(file).name;
  const warnings: string[] = [];
  let context: Context = {
    image,
    width: original.width!,
    height: original.height!,
    format,
    quality,
    background,
    name,
    index,
    warnings,
  };
  for (const step of steps) {
    check();
    if (!step.enabled) continue;
    const result = await processingRegistry.execute(
      step.processor,
      { image: [{ kind: "image", data: context }] },
      step.params,
      { checkCancelled: check, reportProgress: () => {}, log: () => {} },
      step.processorVersion
    );
    context = result.image[0].data as Context;
    check();
  }
  ({ image, format, quality, background, name } = context);
  if (
    !name ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
  )
    throw Error("输出文件名不合法");
  let encoder = sharp(image);
  const buffer = await (format === "jpeg"
    ? encoder.flatten({ background }).jpeg({ quality })
    : format === "webp"
    ? encoder.webp({ quality })
    : encoder.png()
  ).toBuffer();
  check();
  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    width: metadata.width!,
    height: metadata.height!,
    format,
    name: name + "." + (format === "jpeg" ? "jpg" : format),
    warnings: context.warnings,
  };
}
