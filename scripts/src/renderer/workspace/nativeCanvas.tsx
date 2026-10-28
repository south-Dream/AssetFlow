import React, { useEffect, useRef, useState } from "react";
import type { CanvasConfig, CanvasResourceRef, CanvasScriptContext, CanvasValues, FieldDrawContext } from "../../extensions/canvas/contracts";
import type { CanvasModuleDefinition } from "../../../extensions/canvas_modules/sdk/module";
import { createCanvasSession } from "../../../extensions/canvas_modules/sdk/module";
import { createResourceAPI } from "../../extensions/canvas/resources";
import { validateValues } from "../../extensions/canvas/config";
import { registerCanvasResourceOpener } from "./resourceHost";
import { registerCanvasToolParams } from "./canvasToolHost";
import { registerDrawerHost, invalidateDrawers } from "./drawerHost";
import { getCanvasPreferences } from "./canvasPreferences";
import { atlasModule } from "../../../extensions/canvas_modules/atlas/module";

export type NativeCanvasProps = {
  windowId: string; resources: readonly CanvasResourceRef[]; input?: unknown;
  onResources: (refs: readonly CanvasResourceRef[]) => void; onOutput: (value: unknown) => void;
  onNotice: (message: string) => void; onState: () => void; onActivate: () => void; onExported: () => void;
};
export type NativeCanvasModule = {
  create(props: NativeCanvasProps, changed: () => void): CanvasModuleDefinition;
  read(id: string): Promise<ArrayBuffer>;
  params(windowId: string, tool: string): CanvasValues;
  save(windowId: string, prepare: () => Promise<void>): Promise<boolean>;
};
// Closed host-owned registry: installed scripts cannot insert native renderers or services.
const nativeModules: Readonly<Record<string, NativeCanvasModule>> = Object.freeze({ atlas: atlasModule });
export const hasNativeCanvas = (type: string) => Object.prototype.hasOwnProperty.call(nativeModules, type);
export function saveNativeCanvas(type: string, windowId: string, prepare: () => Promise<void>) {
  const module = nativeModules[type];
  if (!module) throw Error("Unknown native canvas");
  return module.save(windowId, prepare);
}

export function NativeCanvas({ type, config, ...props }: NativeCanvasProps & { type: string; config: CanvasConfig }) {
  const root = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  const [error, setError] = useState("");
  const deliver = useRef<((value: unknown) => void) | undefined>(undefined);
  useEffect(() => { deliver.current?.(props.input); }, [props.input]);
  useEffect(() => {
    const module = nativeModules[type];
    const controller = new AbortController();
    let closed = false, session: Awaited<ReturnType<typeof createCanvasSession>> | undefined;
    const cleanup: (() => void)[] = [], commands = new Map<string, (values: CanvasValues) => unknown>();
    let tools: Parameters<CanvasScriptContext["onToolEvent"]>[0] | undefined;
    let properties: Parameters<CanvasScriptContext["onCanvasProperties"]>[0] | undefined;
    const drawers = new Map<string, Parameters<CanvasScriptContext["registerDrawer"]>[1]>();
    const resources = createResourceAPI(config.resources ?? [], id => module.read(id));
    let sealed = false;
    const registering = () => { if (sealed || closed) throw Error("Canvas registration is sealed"); };
    const host: CanvasScriptContext = {
      root: root.current!, windowId: props.windowId, state: null,
      settings: Object.freeze(getCanvasPreferences(type, props.windowId).settings), capabilities: Object.freeze({}),
      previewTarget: "self", resources, canvasProperties: Object.freeze(getCanvasPreferences(type, props.windowId).properties),
      registerCommand: (id, handler) => { registering(); if (commands.has(id)) throw Error("Duplicate command"); commands.set(id, handler); },
      registerDrawer: (id, drawer) => { registering(); if (drawers.has(id)) throw Error("Duplicate drawer"); drawers.set(id, drawer); },
      onToolEvent: handler => { registering(); tools = handler; },
      onInput: handler => { registering(); deliver.current = value => { void Promise.resolve(handler(value)).catch(report); }; },
      onCanvasProperties: handler => { registering(); properties = handler; },
      onPreviewTarget: () => { registering(); }, onSave: () => { registering(); },
      saveState: () => latest.current.onState(), publishOutput: value => latest.current.onOutput(value),
      notify: message => latest.current.onNotice(message),
      selectTool: (tool, params) => window.dispatchEvent(new CustomEvent("assetflow:tool-selected", { detail: { windowId: props.windowId, tool, params } })),
      markToolDirty: (dirty = true) => window.dispatchEvent(new CustomEvent("assetflow:tool-dirty", { detail: { windowId: props.windowId, dirty } })),
    };
    const report = (cause: unknown) => { if (!closed) { setError(String(cause)); latest.current.onNotice(String(cause)); } };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (closed || detail?.windowId !== props.windowId) return;
      if (event.type === "assetflow:canvas-undo" || event.type === "assetflow:canvas-clear") {
        if (!session) { detail.reject?.(Error("Canvas is not ready")); return; }
        void Promise.resolve(event.type.endsWith("undo") ? session.undo() : session.clear()).then(() => detail.resolve?.(), cause => { report(cause); detail.reject?.(cause); });
      } else if (event.type === "assetflow:command") {
        const tool = config.tools.find(tool => tool.command === detail.command);
        const handler = commands.get(detail.command);
        if (!tool || !handler) { report(Error("Unregistered canvas function")); return; }
        void Promise.resolve(handler(validateValues(tool.fields ?? [], detail.params ?? {}))).catch(report);
      } else if (event.type === "assetflow:canvas-properties-changed") {
        void Promise.resolve(properties?.(validateValues(config.inspector?.canvas ?? [], getCanvasPreferences(type, props.windowId).properties))).catch(report);
      } else {
        const tool = config.tools.find(tool => tool.id === detail.tool && tool.kind !== "command");
        if (!tool || !tools) { detail.reject?.(Error("Unregistered canvas tool")); return; }
        if (detail.resolve) event.preventDefault();
        void Promise.resolve().then(() => tools!({ ...detail, params: validateValues(tool.fields ?? [], detail.phase === "cancel" ? {} : detail.params ?? {}) })).then(() => detail.resolve?.(), cause => { report(cause); detail.reject?.(cause); });
      }
    };
    const mount = async () => {
      session = await createCanvasSession(module.create({ ...props,
        onResources: refs => latest.current.onResources(refs), onOutput: value => latest.current.onOutput(value),
        onNotice: message => latest.current.onNotice(message), onState: () => latest.current.onState(),
        onActivate: () => latest.current.onActivate(), onExported: () => latest.current.onExported(),
      }, invalidateDrawers), config, host, controller.signal);
      sealed = true;
      if (closed) { await session.dispose(); return; }
      cleanup.push(registerCanvasResourceOpener(props.windowId, refs => resources.open(refs)));
      cleanup.push(registerCanvasToolParams(props.windowId, tool => module.params(props.windowId, tool)));
      cleanup.push(registerDrawerHost(props.windowId, async (field, values, change) => {
        const drawer = drawers.get(field.renderer!); if (!drawer) throw Error("Unregistered drawer");
        const callbacks = new Map<string, (value: any) => void>(), disposals: (() => void)[] = [];
        let active = true;
        const event = (fn: (value: any) => void) => { const id = String(callbacks.size); callbacks.set(id, fn); return id; };
        const context: FieldDrawContext = { field, values: Object.freeze({ ...values }), value: values[field.id] ?? field.default,
          setValue: value => { if (active) change(value); }, onDispose: fn => disposals.push(fn),
          ui: { fields: (fields, values, onChange) => ({ kind: "fields", fields, values, event: event(onChange) }), text: text => ({ kind: "text", text }), input: o => ({ kind: "input", value: o.value, event: event(o.onChange) }),
            slider: o => ({ kind: "slider", ...o, event: event(o.onChange) }), button: o => ({ kind: "button", text: o.label, event: event(o.onClick) }),
            row: children => ({ kind: "row", children }), column: children => ({ kind: "column", children }) } };
        return { tree: await drawer.draw(context), event: (id, value) => { if (active) callbacks.get(id)?.(value); },
          dispose: () => { active = false; for (const fn of disposals.reverse()) fn(); callbacks.clear(); } };
      }));
      for (const name of ["assetflow:command", "assetflow:tool", "assetflow:canvas-properties-changed", "assetflow:canvas-undo", "assetflow:canvas-clear"]) {
        window.addEventListener(name, receive); cleanup.push(() => window.removeEventListener(name, receive));
      }
      deliver.current?.(latest.current.input);
    };
    void mount().catch(report);
    return () => { closed = true; controller.abort(); deliver.current = undefined; for (const fn of cleanup.reverse()) fn(); void resources.dispose().finally(() => session?.dispose()).catch(() => {}); };
  }, [type, config, props.windowId]);
  return <><div ref={root} style={{ width: "100%", height: "100%" }} />{error && <p role="alert">{error}</p>}</>;
}
