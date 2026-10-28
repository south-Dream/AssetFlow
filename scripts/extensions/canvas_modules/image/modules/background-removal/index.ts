import { InferenceService, ModelRegistry, type CapabilityDefinition, type InferenceAdapter } from "../../../../sdk/processing";
import { createRembgAdapter, type RembgOptions } from "./rembg/adapter";
import manifest from "./rembg/config.json";

export const backgroundRemovalCapability: CapabilityDefinition = {
  id: manifest.capability, version: 1,
  inputs: [{ id: "image", kind: "image" }],
  outputs: [{ id: "image", kind: "image" }, { id: "mask", kind: "mask" }],
};

/** Module composition root; all third-party imports stay under rembg/. */
export function createBackgroundRemoval(options: RembgOptions) {
  const models = new ModelRegistry<InferenceAdapter>();
  models.registerAdapter(createRembgAdapter(options));
  for (const config of manifest.models) models.registerModel({
    id: config.id, name: config.name, description: "Local rembg background removal",
    version: 1, task: manifest.capability, adapter: manifest.adapter,
    artifact: { path: `models/${config.file}`, checksum: config.checksum },
    fields: [{ key: "postProcessMask", label: "Smooth mask", type: "boolean", default: false }],
    defaults: { postProcessMask: false },
  });
  return { models, service: new InferenceService(models, [backgroundRemovalCapability]) };
}
