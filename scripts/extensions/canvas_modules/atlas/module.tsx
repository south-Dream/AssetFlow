import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { CanvasBase, NavNode, ToolNode, defineCanvasModule } from "../sdk/module";
import type { CanvasResourceRef, CanvasValues } from "../sdk/contracts";
import type { NativeCanvasModule } from "../../../src/renderer/workspace/nativeCanvas";
import { AtlasCanvas, atlasSummary, atlasError, atlasProperties, setAtlasProperties, exportAtlasCanvas, type AtlasBridge } from "./view";
import config from "./config.json";

const bridges = new Map<string, AtlasBridge>();
export const atlasModule: NativeCanvasModule = {
  read: id => window.assetFlow.atlas.read(id),
  params: (windowId, tool) => bridges.get(windowId)?.params?.(tool) ?? {},
  save: exportAtlasCanvas,
  create(props, changed) {
    class Atlas extends CanvasBase {
      private root?: Root;
      private inputValue: unknown = props.input;
      readonly bridge: AtlasBridge = { read: id => atlasModule.read(id), changed };
      private render() { this.root!.render(<AtlasCanvas {...props} bridge={this.bridge} input={this.inputValue} />); }
      async draw() {
        this.root = createRoot(this.context.root);
        bridges.set(props.windowId, this.bridge);
        await new Promise<void>(resolve => {
          this.bridge.changed = () => { changed(); if (this.bridge.receive && this.bridge.open) resolve(); };
          this.render();
        });
      }
      drawProperties(context: import("../sdk/module").InspectorDrawContext) { return context.ui.column([
        { ...context.ui.text(atlasSummary(props.windowId)), ...(atlasError(props.windowId) ? { role: "alert" as const } : {}) },
        context.ui.fields(config.inspector.canvas as import("../sdk/contracts").ConfigField[], atlasProperties(props.windowId), values => context.setValue(JSON.stringify(values))),
      ]); }
      open(refs: readonly CanvasResourceRef[]) { if (!this.bridge.open) throw Error("Atlas is not ready"); return this.bridge.open(refs); }
      capture() { return this.bridge.capture!(); }
      restore(state: unknown) { return this.bridge.restore!(state); }
      clear() { return this.bridge.clear!(); }
      edit(tool: string, phase: "preview" | "apply" | "cancel", values: CanvasValues) { return this.tool(tool, phase, values); }
      input(value: unknown) { this.inputValue = value; this.render(); }
      properties(values: CanvasValues) { setAtlasProperties(props.windowId, values); }
      target(_value: "self" | "linked") {}
      save(): never { throw Error("Atlas uses the host multi-file export service"); }
      dispose() { this.root?.unmount(); if (bridges.get(props.windowId) === this.bridge) bridges.delete(props.windowId); }
      command(command: string) {
        if (!this.bridge.receive) throw Error("Atlas view is not ready");
        return new Promise<void>((resolve, reject) => this.bridge.receive!(new CustomEvent("assetflow:command", { detail: { windowId: props.windowId, command, resolve, reject } })));
      }
      tool(tool: string, phase: string, params: CanvasValues) {
        return new Promise<void>((resolve, reject) => {
          if (!this.bridge.receive) { reject(Error("Atlas view is not ready")); return; }
          this.bridge.receive(new CustomEvent("assetflow:tool", { cancelable: true, detail: { windowId: props.windowId, tool, phase, params, resolve, reject } }));
        });
      }
    }
    const classes: Record<string, new (...args: any[]) => any> = { Atlas };
    for (const tool of config.tools) {
      const key = tool.id.replace(/\./g, "_");
      classes[key] = tool.kind === "command" ? class extends NavNode {
        readonly name = tool.name;
        constructor(private canvas: Atlas) { super(); }
        trigger() { return this.canvas.command(tool.command); }
      } : class extends ToolNode {
        readonly name = tool.name;
        draw(context: import("../sdk/module").InspectorDrawContext) { return context.fields(("fields" in tool ? tool.fields ?? [] : []) as import("../sdk/contracts").ConfigField[]); }
      };
    }
    return defineCanvasModule(classes);
  },
};
