import type { ExecutionContext, PortDefinition, PortValues } from "./contracts";
import type { ModelAdapter, ModelDefinition } from "./models";
import { ModelRegistry } from "./models";

export interface CapabilityDefinition {
  id: string;
  version: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}
export interface InferenceSession {
  execute(inputs: PortValues, params: Record<string, unknown>, context: ExecutionContext,
    signal?: AbortSignal): Promise<PortValues>;
  dispose(): Promise<void>;
}
export interface InferenceAdapter extends ModelAdapter {
  apiVersion: 1;
  load(model: ModelDefinition, context: ExecutionContext, signal?: AbortSignal): Promise<InferenceSession>;
}

function checkPorts(ports: PortDefinition[], values: PortValues) {
  if (Object.keys(values).some(key => !ports.some(p => p.id === key))) throw Error("Unknown capability port");
  for (const port of ports) {
    const items = values[port.id];
    if (!Array.isArray(items) || (!port.multiple && items.length !== 1) ||
      items.some(item => item.kind !== port.kind)) throw Error(`Invalid capability port: ${port.id}`);
  }
}

// Serial execution provides a bounded initial resource policy. Sessions belong to
// the service and are always released, including after cancellation or failure.
export class InferenceService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private models: ModelRegistry<InferenceAdapter>,
    private capabilities: readonly CapabilityDefinition[]) {}

  execute(request: { capability: string; version: number; model: string; inputs: PortValues;
    params?: Record<string, unknown> }, context: ExecutionContext, signal?: AbortSignal): Promise<PortValues> {
    const run = async () => {
      const check = () => { signal?.throwIfAborted(); context.checkCancelled(); };
      const execution = { ...context, checkCancelled: check };
      check();
      const capability = this.capabilities.find(c => c.id === request.capability && c.version === request.version);
      if (!capability) throw Error("Unknown capability or unsupported version");
      checkPorts(capability.inputs, request.inputs);
      const { model, adapter, params } = this.models.resolve(request.model, request.capability, request.params);
      if (adapter.apiVersion !== 1) throw Error("Unsupported adapter API version");
      context.reportProgress(0, 1);
      const session = await adapter.load(model, execution, signal);
      try {
        check();
        const outputs = await session.execute(request.inputs, params, execution, signal);
        check();
        checkPorts(capability.outputs, outputs);
        context.reportProgress(1, 1);
        return outputs;
      } finally { await session.dispose(); }
    };
    const result = this.tail.then(run);
    this.tail = result.catch(() => {});
    return result;
  }
}
