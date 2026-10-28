/** Public, transport-only SDK. Internal template objects are never exposed. */
export type CanvasIdentity = { id: string; name: string; desc: string };
export type CanvasResourceRule = {
  extensions?: string[];
  mimeTypes?: string[];
  handler: string;
  mode: "replace" | "append";
  maxCount?: number;
};
export type CanvasResourceRef = {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
};
export type CanvasAcceptResult =
  | boolean
  | { accepted: boolean; reason?: string };
export interface CanvasResourceHandler {
  canAccept(
    resources: readonly CanvasResourceRef[]
  ): CanvasAcceptResult | Promise<CanvasAcceptResult>;
  open(
    resources: readonly CanvasResourceRef[],
    context: { mode: "replace" | "append" }
  ): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
export interface CanvasResourceAPI {
  registerHandler(id: string, handler: CanvasResourceHandler): void;
  read(id: string): Promise<ArrayBuffer>;
  url(id: string): Promise<string>;
  hasHandler(id: string): boolean;
  open(resources: readonly CanvasResourceRef[]): Promise<void>;
  dispose(): Promise<void>;
}
export type ConfigField = {
  id: string;
  name: string;
  type: "text" | "number" | "boolean" | "select";
  default: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  order?: number;
  control?: "input" | "slider" | "button";
  renderer?: string;
  command?: string;
};
export type CanvasTool = {
  id: string;
  name: string;
  command: string;
  desc?: string;
  icon?: string;
  shortcut?: string;
  kind?: "command" | "tool";
  toolbar?: boolean;
  fields?: ConfigField[];
};
export type CanvasMenu = import("../../sdk/contracts").NavigationItem & {
  placement?: "edit" | "specific";
  children?: CanvasMenu[];
};
export type CanvasConfig = CanvasIdentity & {
  bindings?: import("./module").CanvasBindings;
  schemaVersion: 1;
  sdkVersion: 1;
  version: string;
  entry?: string;
  tools: CanvasTool[];
  menus: CanvasMenu[];
  settings: ConfigField[];
  capabilities?: { id: string; config: string }[];
  resources?: CanvasResourceRule[];
  inspector?: {
    canvas: ConfigField[];
    operations: Record<string, ConfigField[]>;
  };
};
export type CanvasModuleRecord = {
  config: CanvasConfig;
  enabled: boolean;
  configPath: string;
  revision: number;
  error?: string;
  iconData?: Record<string, string>;
};
export type ModulePayload = {
  config: CanvasConfig;
  source: string;
  revision: number;
  capabilities: Record<string, unknown>;
};
export type CanvasValues = Record<string, string | number | boolean>;
export type CanvasDocument = {
  version: 1;
  type: string;
  moduleVersion: string;
  state: unknown;
  canvasProperties?: CanvasValues;
};
export type CanvasSaveResult = { data: ArrayBuffer; name?: string };
export interface CanvasScriptContext {
  selectTool?(tool: string | undefined, params: CanvasValues): void;
  readonly root: HTMLElement;
  readonly windowId: string;
  readonly settings: Readonly<CanvasValues>;
  readonly state: unknown;
  readonly capabilities: Readonly<Record<string, unknown>>;
  readonly previewTarget: "self" | "linked";
  readonly resources: CanvasResourceAPI;
  readonly canvasProperties: Readonly<CanvasValues>;
  onCanvasProperties(
    handler: (values: CanvasValues) => void | Promise<void>
  ): void;
  registerDrawer(
    id: string,
    drawer: {
      draw(context: FieldDrawContext): InspectorUI | Promise<InspectorUI>;
      dispose?(): void;
    }
  ): void;
  registerCommand(
    id: string,
    handler: (params: CanvasValues) => void | Promise<void>
  ): void;
  onToolEvent(
    handler: (event: {
      phase: "preview" | "apply" | "cancel";
      tool: string;
      params: CanvasValues;
    }) => void | Promise<void>
  ): void;
  onSave(handler: () => CanvasSaveResult | Promise<CanvasSaveResult>): void;
  onInput(handler: (value: unknown) => void | Promise<void>): void;
  onPreviewTarget(handler: (target: "self" | "linked") => void): void;
  publishOutput(value: unknown): void;
  saveState(value: unknown): void;
  notify(message: string): void;
  markToolDirty(dirty?: boolean): void;
}
export type InspectorUI = {
  fields?: ConfigField[];
  values?: CanvasValues;
  kind: string;
  role?: "status" | "alert";
  text?: string;
  value?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  event?: string;
  children?: InspectorUI[];
};
export interface FieldDrawContext {
  field: ConfigField;
  value: string | number | boolean;
  values: Readonly<CanvasValues>;
  setValue(value: string | number | boolean): void;
  onDispose(cleanup: () => void): void;
  ui: {
    fields(fields: ConfigField[], values: CanvasValues, onChange: (values: CanvasValues) => void): InspectorUI;
    text(text: string): InspectorUI;
    input(options: {
      value: string | number;
      onChange: (value: string | number) => void;
    }): InspectorUI;
    slider(options: {
      value: number;
      min: number;
      max: number;
      step?: number;
      onChange: (value: number) => void;
    }): InspectorUI;
    button(options: { label: string; onClick: () => void }): InspectorUI;
    row(children: InspectorUI[]): InspectorUI;
    column(children: InspectorUI[]): InspectorUI;
  };
}
/** Module-owned adaptation; the core never runs arbitrary parser hooks. */
export interface InspectorAdapter<Model> {
  describe(model: Model): ConfigField[];
  read(model: Model, fieldId: string): string | number | boolean;
  write(model: Model, fieldId: string, value: string | number | boolean): void;
}
/** Host transport interface; author modules use CanvasBase and Node classes. */
