import path from "node:path";
import type { Processor } from "../processing/processors/types";
import { createBackgroundRemoval } from "./index";

// The host supplies a module root in packaged applications. Development uses
// the source package, including its private Python environment and model files.
export const removeBackground: Processor = async (context, params) => {
  const directory = process.env.ASSETFLOW_REMBG_DIRECTORY ??
    path.resolve("scripts/extensions/canvas_modules/image/modules/background-removal/rembg");
  const { service } = createBackgroundRemoval({ directory,
    python: process.env.ASSETFLOW_REMBG_PYTHON });
  const outputs = await service.execute({
    capability: "image.remove-background", version: 1, model: params.model,
    inputs: { image: [{ kind: "image", data: context.image }] },
    params: { postProcessMask: params.postProcessMask },
  }, { checkCancelled() {}, reportProgress() {}, log() {} });
  context.image = Buffer.from(outputs.image[0].data as Uint8Array);
  // JPEG sources otherwise default to JPEG and silently lose their new alpha.
  if (context.format === "jpeg") context.format = "png";
};
