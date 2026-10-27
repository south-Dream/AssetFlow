import type { AssetModule, ExecutionContext, PortDefinition, PortValues, ProcessorRegistration } from "./contracts";
import { validateParams } from "./validation";
function validatePorts(ports: readonly PortDefinition[], values: PortValues) {
  if (Object.keys(values).some(id => !ports.some(p => p.id === id)))
    throw Error("Unknown port");
  for (const port of ports) {
    const assets = values[port.id];
    if (!Array.isArray(assets) || (!port.multiple && assets.length !== 1) ||
        assets.some(a => !a || a.kind !== port.kind))
      throw Error(`Invalid port type or cardinality: ${port.id}`);
  }
}
export class ProcessorRegistry {
  private readonly entries = new Map<string, ProcessorRegistration>();
  register(module: AssetModule): void {
    const ids = new Set<string>();
    for (const entry of module.processors) {
      const d = entry.definition;
      if (d.module !== module.id || !d.id || !Number.isInteger(d.version) || d.version < 1 ||
          ids.has(d.id) || this.entries.has(d.id)) throw Error("Duplicate or invalid processor registration");
      for (const ports of [d.inputs, d.outputs]) {
        if (new Set(ports.map(p => p.id)).size !== ports.length || ports.some(p => !p.id || !p.kind))
          throw Error("Invalid port definition");
      }
      ids.add(d.id);
    }
    for (const entry of module.processors) this.entries.set(entry.definition.id, entry);
  }
  async execute(id: string, inputs: PortValues, params: unknown, context: ExecutionContext,
    version?: number): Promise<PortValues> {
    const entry = this.entries.get(id);
    if (!entry) throw Error(`Unknown processor: ${id}`);
    if (version !== undefined && version !== entry.definition.version) throw Error("Unsupported processor version");
    context.checkCancelled();
    validatePorts(entry.definition.inputs, inputs);
    const result = await entry.execute(inputs, validateParams(entry.definition, params), context);
    context.checkCancelled();
    validatePorts(entry.definition.outputs, result);
    return result;
  }
}
