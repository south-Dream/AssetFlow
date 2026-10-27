// Serializable catalog; importing this file never loads Sharp or other engines.
import { imageDefinitions } from "../extensions/adapters/imageCatalog";
import type { ProcessorDefinition } from "./framework/contracts";
import { validateSteps as validate } from "./framework/validation";
export const definitions: ProcessorDefinition[] = imageDefinitions;
export const validateSteps = (input: unknown) => validate(input, definitions);
