/** Trusted builtin processing SDK. Browser Canvas entries must not import this Node-side API. */
export { InferenceService } from "../../src/core/framework/inference";
export { ModelRegistry } from "../../src/core/framework/models";
export { ProcessorRegistry } from "../../src/core/framework/registry";
export { validateSteps } from "../../src/core/framework/validation";
export type { InferenceAdapter, CapabilityDefinition } from "../../src/core/framework/inference";
export type { ModelDefinition } from "../../src/core/framework/models";
export type { AssetModule, ProcessorDefinition } from "../../src/core/framework/contracts";
export type { Step, Definition, Field } from "../../src/shared";
