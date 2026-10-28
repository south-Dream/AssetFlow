import { NavNode, ToolNode as ToolNodeBase } from "../../sdk/nodes";
import type { CanvasConfig, CanvasResourceRef, CanvasSaveResult, CanvasScriptContext, CanvasValues, FieldDrawContext, InspectorUI, ConfigField } from "./contracts";
export { NavNode } from "../../sdk/nodes";

export type InspectorDrawContext = FieldDrawContext & { fields(fields: readonly ConfigField[]): InspectorUI };
export type CanvasContext = Readonly<Pick<CanvasScriptContext,
  "root" | "windowId" | "settings" | "state" | "capabilities" | "previewTarget" |
  "canvasProperties" | "publishOutput" | "saveState" | "notify" | "markToolDirty">> & {
  readonly resources: Readonly<Pick<CanvasScriptContext["resources"], "read" | "url">>;
  readonly selectTool: (node: ToolNode) => void;
};
export type CanvasBindings = { canvas: string; nodes: Record<string, string> };
export abstract class CanvasBase {
  constructor(protected readonly context: CanvasContext) {}
  abstract draw(): void | Promise<void>;
  abstract drawProperties(context: InspectorDrawContext): InspectorUI | Promise<InspectorUI>;
  abstract input(value: unknown): void | Promise<void>;
  abstract properties(values: CanvasValues): void | Promise<void>;
  abstract target(value: "self" | "linked"): void | Promise<void>;
  abstract open(resources: readonly CanvasResourceRef[], context: { mode: "replace" | "append" }): void | Promise<void>;
  abstract capture(): unknown | Promise<unknown>;
  abstract restore(state: unknown): void | Promise<void>;
  abstract clear(): void | Promise<void>;
  abstract save(): CanvasSaveResult | Promise<CanvasSaveResult>;
  abstract dispose(): void | Promise<void>;
  // Internal edit adapter; authors may instead edit directly through their draw callbacks.
  edit(_tool: string, _phase: "preview" | "apply" | "cancel", _values: CanvasValues): void | Promise<void> {}
}
export abstract class ToolNode extends ToolNodeBase<InspectorDrawContext, InspectorUI, CanvasBase, CanvasContext> {}
export type CanvasModuleDefinition = { contractVersion: 3; classes: Readonly<Record<string, new (...args: any[]) => any>> };
export function defineCanvasModule(classes: CanvasModuleDefinition["classes"]): CanvasModuleDefinition {
  return Object.freeze({ contractVersion: 3, classes: Object.freeze({ ...classes }) });
}

/** Self-contained: the same assembler runs in the native host and opaque sandbox. */
export async function createCanvasSession(definition: CanvasModuleDefinition, config: CanvasConfig, host: CanvasScriptContext, signal?: AbortSignal) {
  const bindings = config.bindings;
  if (definition?.contractVersion !== 3 || !bindings || !definition.classes || typeof definition.classes !== "object")
    throw Error("Canvas requires contractVersion 3 and canvas/nodes bindings");
  const classes = Object.freeze({ ...definition.classes });
  const lookup = (name: string) => {
    if (!Object.prototype.hasOwnProperty.call(classes, name) || typeof classes[name] !== "function") throw Error(`Unregistered module class: ${name}`);
    return classes[name];
  };
  const methods = (value: any, names: string[], label: string) => {
    for (const name of names) if (typeof value?.[name] !== "function") throw Error(`${label} must implement ${name}()`);
  };
  const ids = config.tools.map(tool => tool.id);
  if (!bindings.nodes || Object.keys(bindings.nodes).length !== ids.length || ids.some(id => !Object.prototype.hasOwnProperty.call(bindings.nodes, id))) throw Error("Node bindings must exactly match declarations");
  const byCommand = new Map(config.tools.map(tool => [tool.command, tool]));
  if (byCommand.size !== config.tools.length) throw Error("Node commands must be unique");
  const checkMenus = (items: typeof config.menus) => { for (const item of items) {
    if (item.command && !byCommand.has(item.command)) throw Error(`Navigation must reference a node: ${item.command}`);
    if (item.children) checkMenus(item.children);
  } }; checkMenus(config.menus);
  let disposed = false, active: string | undefined, selected: string | undefined;
  let pending = Promise.resolve();
  const nodes = new Map<string, any>();
  const history: { state: unknown; tool?: string; params: CanvasValues }[] = [];
  let baseline: unknown, currentParams: CanvasValues = {}, selectedParams: CanvasValues = {};
  const notifySelection = (tool?: string, params: CanvasValues = {}) => host.selectTool?.(tool, params);
  const context: CanvasContext = Object.freeze({
    root: host.root, windowId: host.windowId, settings: host.settings, state: host.state,
    capabilities: host.capabilities, previewTarget: host.previewTarget, canvasProperties: host.canvasProperties,
    resources: Object.freeze({ read: (id: string) => host.resources.read(id), url: (id: string) => host.resources.url(id) }),
    publishOutput: (value: unknown) => host.publishOutput(value), saveState: (value: unknown) => host.saveState(value),
    notify: (message: string) => host.notify(message), markToolDirty: (dirty?: boolean) => host.markToolDirty(dirty),
    selectTool: (node: any) => {
      const entry = [...nodes].find(([, instance]) => instance === node);
      if (!entry || config.tools.find(tool => tool.id === entry[0])?.kind === "command") throw Error("Unknown tool instance");
      notifySelection(entry[0], currentParams);
    },
  });
  let canvas: any;
  const dispose = async () => { if (disposed) return; disposed = true; await canvas?.dispose?.(); };
  const enqueue = (task: () => unknown) => {
    const result = pending.then(async () => { if (disposed) throw Error("Canvas session disposed"); await task(); });
    pending = result.catch(() => {}); return result;
  };
  const parameters = (id: string, values: CanvasValues): CanvasValues => Object.fromEntries((config.tools.find(tool => tool.id === id)?.fields ?? []).map(field => {
    const value = values[field.id] ?? field.default;
    if (typeof value !== typeof field.default || (typeof value === "number" && (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) || (field.type === "select" && !field.options?.includes(String(value)))) throw Error(`Invalid function parameter: ${field.id}`);
    return [field.id, value];
  }));
  const drawContext = (ctx: FieldDrawContext): InspectorDrawContext => Object.freeze({ ...ctx,
    fields: (fields: readonly ConfigField[]) => ctx.ui.fields([...fields], { ...ctx.values }, values => ctx.setValue(JSON.stringify(values))),
  });
  try {
    const Canvas = lookup(bindings.canvas); canvas = new Canvas(context);
    methods(canvas, ["draw", "drawProperties", "input", "properties", "target", "open", "capture", "restore", "clear", "save", "dispose"], bindings.canvas);
    for (const tool of config.tools) {
      const Node = lookup(bindings.nodes[tool.id]), node = new Node(canvas, context);
      if (typeof node.name !== "string" || !node.name.trim()) throw Error(`Node requires name: ${tool.id}`);
      if (tool.kind === "command") methods(node, ["trigger"], tool.id);
      else {
        if (node.kind !== "tool") throw Error(`Wrong node kind: ${tool.id}`);
        methods(node, ["trigger", "draw"], tool.id);
        const trigger = Object.getOwnPropertyDescriptor(node, "trigger");
        if (!trigger || trigger.writable || trigger.configurable) throw Error(`Tool must inherit the fixed ToolNode trigger: ${tool.id}`);
      }
      nodes.set(tool.id, node);
    }
    const activate = async (id: string, values: CanvasValues) => {
      if (active && active !== id) throw Error("Finish the active tool before switching functions");
      if (!active) baseline = structuredClone(await canvas.capture());
      active = id; currentParams = values;
      await nodes.get(id).trigger();
      notifySelection(id, values);
    };
    for (const tool of config.tools) host.registerCommand(tool.command, values => enqueue(async () => {
      const node = nodes.get(tool.id);
      if (tool.kind === "command") {
        const before = structuredClone(await canvas.capture());
        await node.trigger();
        if (JSON.stringify(before) !== JSON.stringify(await canvas.capture())) history.push({ state: before, tool: selected, params: structuredClone(selectedParams) });
        return;
      }
      await activate(tool.id, parameters(tool.id, values));
    }));
    host.onToolEvent(event => enqueue(async () => {
      if (!nodes.has(event.tool) || config.tools.find(tool => tool.id === event.tool)?.kind === "command" || !["preview", "apply", "cancel"].includes(event.phase)) throw Error(`Invalid tool event: ${event.tool}`);
      if (event.phase === "cancel") {
        if (active) {
          if (typeof canvas.edit === "function") await canvas.edit(active, "cancel", currentParams);
          await canvas.restore(baseline); active = undefined;
        }
        return;
      }
      const values = parameters(event.tool, event.params);
      if (active !== event.tool) await activate(event.tool, values);
      currentParams = values;
      if (typeof canvas.edit === "function") await canvas.edit(event.tool, event.phase, values);
      if (event.phase === "apply") {
        history.push({ state: baseline, tool: selected, params: selectedParams });
        selected = event.tool; selectedParams = structuredClone(values); active = undefined;
      }
    }));
    for (const handler of new Set((config.resources ?? []).map(rule => rule.handler))) host.resources.registerHandler(handler, {
      canAccept: () => true, open: (refs, mode) => enqueue(async () => { await canvas.open(refs, mode); history.length = 0; active = selected = undefined; notifySelection(); }),
    });
    host.registerDrawer(`${config.id}.__canvas`, { draw: ctx => canvas.drawProperties(drawContext(ctx)) });
    for (const tool of config.tools.filter(tool => tool.kind !== "command")) host.registerDrawer(`${tool.id}.__tool`, { draw: ctx => nodes.get(tool.id).draw(drawContext(ctx)) });
    host.onCanvasProperties(values => enqueue(() => canvas.properties(values)));
    host.onInput(value => enqueue(() => canvas.input(value)));
    host.onPreviewTarget(value => { void enqueue(() => canvas.target(value)).catch(error => host.notify(String(error))); });
    host.onSave(async () => { await pending; if (disposed) throw Error("Canvas session disposed"); return canvas.save(); });
    if (signal?.aborted) throw Error("Canvas mount aborted");
    let abort: (() => void) | undefined;
    try {
      await Promise.race([Promise.resolve().then(() => canvas.draw()), new Promise<never>((_, reject) => {
        abort = () => reject(Error("Canvas mount aborted")); signal?.addEventListener("abort", abort, { once: true });
      })]);
    } finally { if (abort) signal?.removeEventListener("abort", abort); }
    return Object.freeze({
      dispose: async () => { await pending; await dispose(); },
      undo: () => enqueue(async () => {
        if (active) { await canvas.restore(baseline); active = undefined; notifySelection(selected, selectedParams); return; }
        const previous = history.at(-1); if (!previous) return;
        await canvas.restore(structuredClone(previous.state)); history.pop(); selected = previous.tool; selectedParams = previous.params;
        notifySelection(selected, selectedParams);
      }),
      clear: () => enqueue(async () => {
        const before = active ? baseline : structuredClone(await canvas.capture());
        await canvas.clear(); history.push({ state: before, tool: selected, params: selectedParams });
        active = selected = undefined; notifySelection();
      }),
    });
  } catch (error) { await dispose().catch(() => {}); throw error; }
}
