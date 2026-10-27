export type Field = {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "boolean" | "color";
  default: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
};
export type Definition = {
  id: string;
  name: string;
  description: string;
  fields: Field[];
};
export type Step = {
  id: string;
  processor: string;
  enabled: boolean;
  params: Record<string, any>;
  processorVersion?: number;
};

// Transport-neutral values: data can be a file/store reference or a module payload.
export interface AssetValue<K extends string = string, T = unknown> {
  kind: K;
  data: T;
}
export interface PortDefinition {
  id: string;
  kind: string;
  multiple?: boolean;
}
export type PortValues = Readonly<Record<string, readonly AssetValue[]>>;
export interface ProcessorDefinition extends Definition {
  module: string;
  version: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}
export interface ExecutionContext {
  checkCancelled(): void;
  reportProgress(completed: number, total: number): void;
  log(level: "info" | "warning", message: string): void;
}
export interface ProcessorRegistration {
  definition: ProcessorDefinition;
  execute(inputs: PortValues, params: Readonly<Record<string, unknown>>,
    context: ExecutionContext): Promise<PortValues>;
}
export interface AssetModule {
  id: string;
  processors: readonly ProcessorRegistration[];
}

export interface WorkflowDefinition {
  version: 1;
  nodes: Step[];
  edges: {
    from: { node: string; port: string };
    to: { node: string; port: string };
  }[];
}
