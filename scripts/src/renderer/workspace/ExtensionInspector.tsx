import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasTool, CanvasValues } from "../../extensions/canvas/contracts";
import { fieldDefaults, validateValues } from "../../extensions/canvas/config";
import { InspectorMgr } from "./managers";
import { NodeInspectorDraw } from "./NodeInspectorDraw";
import { CanvasFields } from "./CanvasFields";
import { acceptCanvasCommand } from "./canvasPreferences";
import { sameToolParams, confirmToolSwitch, sendToolPhase } from "./toolSwitch";
import { registerCanvasSavePreparation } from "./canvasSavePreparation";
import { getCanvasToolParams } from "./canvasToolHost";
import { configFor, useModules } from "./moduleRegistry";

export function CanvasOperationRuntime({
  windowId,
  type,
}: {
  windowId: string;
  type: string;
}) {
  useModules();
  const config = configFor(type);
  const [tool, setTool] = useState<CanvasTool>();
  const [params, setParams] = useState<CanvasValues>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const baseline = useRef<CanvasValues>({});
  const explicitDirty = useRef(false);
  const queue = useRef(Promise.resolve());
  const draft = useRef<{ tool: CanvasTool; params: CanvasValues } | undefined>(
    undefined
  );

  const emit = (phase: string, selected = tool, values = params) => {
    if (selected)
      window.dispatchEvent(
        new CustomEvent("assetflow:tool", {
          detail: { windowId, tool: selected.id, phase, params: values },
        })
      );
  };
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.windowId !== windowId) return;
      const next = config?.tools.find(candidate => candidate.command === detail.command);
      if (!next) return;
      const execute = async () => {
        const current = draft.current;
        if (current?.tool.id === next.id) return;
        if (current) {
          let choice: "apply" | "discard" | "cancel" = "discard";
          if (explicitDirty.current || !sameToolParams(current.params, baseline.current)) choice = await confirmToolSwitch(current.tool.name, next.name, () => { try { validateValues(current.tool.fields ?? [], current.params); return ""; } catch(error) { return String(error); } });
          if (choice === "cancel") return;
          setBusy(true);
          try { await sendToolPhase(windowId, current.tool.id, current.params, choice === "apply" ? "apply" : "cancel"); }
          finally { setBusy(false); }
        }
        explicitDirty.current = false;
        if (next.kind === "command") { draft.current = undefined; setTool(undefined); acceptCanvasCommand(windowId, next.command); return; }
        const values = validateValues(next.fields ?? [], getCanvasToolParams(windowId, next.id, fieldDefaults(next.fields ?? [])));
        baseline.current = structuredClone(values);
        draft.current = { tool: next, params: values };
        setTool(next); setParams(values); setError("");
        acceptCanvasCommand(windowId, next.command, values);
        queueMicrotask(() => emit("preview", next, values));
      };
      queue.current = queue.current.then(execute).catch(error => setError(String(error)));
    };
    const changed = (event: Event) => { if ((event as CustomEvent).detail.windowId === windowId) explicitDirty.current = (event as CustomEvent).detail.dirty; };
    window.addEventListener("assetflow:command-request", listener); window.addEventListener("assetflow:tool-dirty", changed);
    return () => { window.removeEventListener("assetflow:command-request", listener); window.removeEventListener("assetflow:tool-dirty", changed); };
  }, [windowId, config]);
  useEffect(
    () => () => {
      if (draft.current)
        emit("cancel", draft.current.tool, draft.current.params);
    },
    [windowId, type]
  );
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent).detail.windowId === windowId) {
        draft.current = undefined;
        explicitDirty.current = false;
        baseline.current = {};
        setTool(undefined); setParams({}); setError("");
      }
    };
    window.addEventListener("assetflow:runtime-reset", reset);
    return () => window.removeEventListener("assetflow:runtime-reset", reset);
  }, [windowId]);
  const finish = (phase: "apply" | "cancel") => {
    setBusy(true);
    queue.current = queue.current.then(async () => {
      const current = draft.current;
      if (!current) return;
      await sendToolPhase(windowId, current.tool.id, current.params, phase);
      if (draft.current === current) {
        draft.current = undefined;
        explicitDirty.current = false;
        setTool(undefined);
      }
    }).catch(error => setError(String(error))).finally(() => setBusy(false));
  };
  useEffect(() => registerCanvasSavePreparation(windowId, {
    dirty: () => !!draft.current && (explicitDirty.current || !sameToolParams(draft.current.params, baseline.current)),
    prepare: async () => {
      await queue.current;
      const current = draft.current;
      if (!current) return;
      validateValues(current.tool.fields ?? [], current.params);
      await sendToolPhase(windowId, current.tool.id, current.params, "apply");
      if (draft.current === current) { draft.current = undefined; explicitDirty.current = false; setTool(undefined); }
    }
  }), [windowId]);
  useEffect(() => { InspectorMgr.operation(windowId).set({ tool, params, error, busy }); }, [windowId, tool, params, error, busy]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.windowId !== windowId) return;
      if (event.type === "assetflow:tool-selected") {
        const next = config?.tools.find(item => item.id === detail.tool);
        const values = next ? validateValues(next.fields ?? [], detail.params ?? {}) : {};
        // Selection notification only updates display. It never starts another operation.
        const current = draft.current;
        if (next && current?.tool.id === next.id && sameToolParams(current.params, values)) return;
        baseline.current = structuredClone(values); explicitDirty.current = false;
        draft.current = next ? { tool: next, params: values } : undefined;
        setTool(next); setParams(values); setError("");
      } else if (detail.phase) finish(detail.phase);
      else {
        const current = draft.current; if (!current) return;
        const values = detail.values;
        draft.current = { tool: current.tool, params: values }; setParams(values);
        try { validateValues(current.tool.fields ?? [], values); emit("preview", current.tool, values); setError(""); }
        catch (error) { setError(String(error)); }
      }
    };
    window.addEventListener("assetflow:tool-selected", receive);
    window.addEventListener("assetflow:inspector-operation", receive);
    return () => { window.removeEventListener("assetflow:tool-selected", receive); window.removeEventListener("assetflow:inspector-operation", receive); };
  });
  return null;
}

export function ExtensionInspector({ windowId, type }: { windowId: string; type: string }) {
  useModules();
  const config = configFor(type);
  const store = InspectorMgr.operation(windowId);
  const { tool, params, error, busy } = useSyncExternalStore(store.subscribe, store.get);
  const change = (values: CanvasValues) => window.dispatchEvent(new CustomEvent("assetflow:inspector-operation", { detail: { windowId, values } }));
  const finish = (phase: "apply" | "cancel") => window.dispatchEvent(new CustomEvent("assetflow:inspector-operation", { detail: { windowId, phase } }));
  return (
      <div className="parameters">
        {tool ? (
          <>
            <h3>{tool.name}</h3>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {config?.bindings ? <NodeInspectorDraw windowId={windowId} id={`${tool.id}.__tool`} values={params} onChange={change} /> : <CanvasFields windowId={windowId} fields={tool.fields ?? []} values={params} onChange={change} />}
            <button
              disabled={!!error || busy}
              onClick={() => {
                finish("apply");
              }}
            >
              应用
            </button>
            <button
              disabled={busy}
              onClick={() => {
                finish("cancel");
              }}
            >
              取消
            </button>
            </fieldset>
            {error && <p>{error}</p>}
          </>
        ) : (
          <p className="hint">
            {config?.tools.length
              ? "从画布左侧选择操作，在此调整参数。"
              : "此类型尚未提供编辑工具"}
          </p>
        )}
      </div>
  );
}
