import { definitions } from "../catalog";
import { resize } from "./resize";
import { crop } from "./crop";
import { canvas } from "./canvas";
import { rotate } from "./rotate";
import { trim } from "./trim";
import { convert } from "./convert";
import { rename } from "./rename";
import type { Processor } from "./types";
import { removeBackground } from "../../background-removal/processor";
const implementations: Record<string, Processor> = {
  "remove-background": removeBackground,
  resize,
  crop,
  canvas,
  rotate,
  trim,
  convert,
  rename,
};
import sharp from "sharp";
import type { Context } from "./types";
import { ProcessorRegistry, type AssetModule } from "../../../../../sdk/processing";

// The mutable Sharp API is private to this adapter. Every invocation owns its
// context and pixel buffer so downstream branches cannot modify their input.
export const imageModule: AssetModule = {
  id: "image",
  processors: definitions.map(definition => {
    const implementation = implementations[definition.id];
    if (!implementation) throw Error(`Missing image implementation: ${definition.id}`);
    return {
      definition,
      async execute(inputs, params, execution) {
        const source = inputs.image[0].data as Context;
        const context: Context = { ...source, image: Buffer.from(Uint8Array.from(source.image)), warnings: [...source.warnings] };
        const meta = await sharp(context.image).metadata();
        context.width = meta.width!;
        context.height = meta.height!;
        execution.checkCancelled();
        const operation = await implementation(context, { ...params });
        if (operation) context.image = await operation.png().toBuffer();
        const result = await sharp(context.image).metadata();
        context.width = result.width!;
        context.height = result.height!;
        for (const warning of context.warnings.slice(source.warnings.length)) execution.log("warning", warning);
        return { image: [{ kind: "image", data: context }] };
      },
    };
  }),
};
export const processingRegistry = new ProcessorRegistry();
processingRegistry.register(imageModule);
