import type { Definition } from "./contracts";
import { validateParams } from "./validation";

// Configuration describes compatibility; adapter code owns loading and inference.
export interface ModelDefinition extends Definition {
  version: number;
  task: string;
  adapter: string;
  artifact: { path: string; checksum: string };
  defaults: Record<string, unknown>;
}
export interface ModelAdapter {
  id: string;
  supports(model: ModelDefinition): boolean;
}
export class ModelRegistry<A extends ModelAdapter> {
  private readonly models = new Map<string, ModelDefinition>();
  private readonly adapters = new Map<string, A>();
  registerAdapter(adapter: A): void {
    if (!adapter.id || this.adapters.has(adapter.id)) throw Error("Duplicate or invalid model adapter");
    this.adapters.set(adapter.id, adapter);
  }
  registerModel(model: ModelDefinition): void {
    if (!model.id || this.models.has(model.id) || !model.task || !model.adapter ||
        !Number.isInteger(model.version) || model.version < 1 ||
        !model.artifact.path || !model.artifact.checksum) throw Error("Invalid model definition");
    validateParams(model, model.defaults);
    this.models.set(model.id, structuredClone(model));
  }
  available(task: string): ModelDefinition[] {
    return [...this.models.values()].filter(model => model.task === task &&
      this.adapters.get(model.adapter)?.supports(structuredClone(model))).map(model => structuredClone(model));
  }
  resolve(id: string, task: string, params: Record<string, unknown> = {}) {
    const stored = this.models.get(id);
    if (!stored || stored.task !== task) throw Error("Unknown model or incompatible task");
    const model = structuredClone(stored);
    const adapter = this.adapters.get(model.adapter);
    if (!adapter || !adapter.supports(model)) throw Error("Model adapter unavailable or incompatible");
    return { model, adapter, params: validateParams(model, { ...model.defaults, ...params }) };
  }
}
