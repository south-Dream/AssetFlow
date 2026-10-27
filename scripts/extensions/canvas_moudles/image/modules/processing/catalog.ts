import { definitions as metadata } from "./processors/definitions";
import { validateSteps as validate, type ProcessorDefinition } from "../../../../sdk/processing";
export const definitions: ProcessorDefinition[] = metadata.map(definition => ({
  ...definition, module: "image", version: 1,
  inputs: [{ id: "image", kind: "image" }], outputs: [{ id: "image", kind: "image" }],
}));
export const validateSteps = (input: unknown) => validate(input, definitions);
