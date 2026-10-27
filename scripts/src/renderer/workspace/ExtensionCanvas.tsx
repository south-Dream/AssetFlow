import React, { useEffect, useRef, useState } from "react";
import type {
  CanvasConfig,
  ModulePayload,
  CanvasResourceRef,
} from "../../extensions/canvas/contracts";
import { matchResourceRule } from "../../extensions/canvas/resources";
import { registerCanvasResourceOpener } from "./resourceHost";
import { registerCanvasSaver, validateCanvasSaveResult } from "./canvasSaveHost";
import type { CanvasSaveResult } from "../../extensions/canvas/contracts";
import { registerDrawerHost } from "./drawerHost";
import type {
  ConfigField,
  CanvasValues,
  InspectorUI,
} from "../../extensions/canvas/contracts";
import { fieldDefaults, validateValues } from "../../extensions/canvas/config";
import { useCanvasPreferences } from "./canvasPreferences";

function commandIds(config: CanvasConfig): string[] {
  const menuIds = (menus: CanvasConfig["menus"]): string[] =>
    menus.flatMap((menu) =>
      menu.command ? [menu.command] : menuIds(menu.children ?? [])
    );
  return [
    ...new Set([
      ...config.tools.map((tool) => tool.command),
      ...menuIds(config.menus),
      ...[
        ...(config.inspector?.canvas ?? []),
        ...config.tools.flatMap((tool) => tool.fields ?? []),
      ].flatMap((field) => (field.command ? [field.command] : [])),
    ]),
  ];
}
export function ExtensionCanvas({
  windowId,
  type,
  input,
  onOutput,
  onNotice,
  onState,
  onActivate,
  linked,
  resources,
  onResources,
}: {
  windowId: string;
  type: string;
  input?: unknown;
  onOutput: (value: unknown) => void;
  onNotice: (value: string) => void;
  onState: () => void;
  onActivate: () => void;
  linked: boolean;
  resources: readonly CanvasResourceRef[];
  onResources: (resources: readonly CanvasResourceRef[]) => void;
}) {
  const [payload, setPayload] = useState<ModulePayload>();
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const resourceRefs = useRef(resources);
  resourceRefs.current = resources;
  const resourceCallback = useRef(onResources);
  resourceCallback.current = onResources;
  const grants = useRef(new Map<string, CanvasResourceRef>());
  const requests = useRef(
    new Map<
      string,
      { resolve: () => void; reject: (error: Error) => void; timer: number }
    >()
  );
  const saveRequests = useRef(new Map<string, { resolve: (result: CanvasSaveResult) => void; reject: (error: Error) => void; timer: number }>());
  const drawRequests = useRef(
    new Map<
      string,
      {
        resolve: (tree: InspectorUI) => void;
        reject: (error: Error) => void;
        change: (value: string | number | boolean) => void;
        timer: number;
      }
    >()
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const preferences = useCanvasPreferences(type, windowId);
  const callbacks = useRef({ onOutput, onNotice, onState, onActivate });
  callbacks.current = { onOutput, onNotice, onState, onActivate };
  const inputRef = useRef(input);
  inputRef.current = input;
  const send = (type: string, value: unknown) =>
    frame.current?.contentWindow?.postMessage(
      { channel: "assetflow.canvas.v1", type, value },
      "*"
    );
  const stateKey = `assetflow.document.${type}.${windowId}`;
  useEffect(() => {
    let live = true;
    setReady(false);
    setPayload(undefined);
    setError("");
    void window.assetFlow.canvasModules
      .payload(type)
      .then((value) => {
        if (live) setPayload(value);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      send("dispose", null);
    };
  }, [type, windowId]);
  const settingsJson = JSON.stringify(preferences.settings);
  useEffect(() => {
    if (!payload?.source) return;
    let live = true;
    let session = "";
    setReady(false);
    setUrl("");
    window.dispatchEvent(
      new CustomEvent("assetflow:runtime-reset", { detail: { windowId } })
    );
    try {
      const settings = validateValues(payload.config.settings, {
        ...fieldDefaults(payload.config.settings),
        ...preferences.settings,
      });
      const state = JSON.parse(localStorage.getItem(stateKey) ?? "null");
      void window.assetFlow.canvasModules
        .mount(type, {
          windowId,
          settings,
          state,
          previewTarget: linked ? "linked" : "self",
          canvasProperties: preferences.properties,
        })
        .then((value) => {
          session = value;
          if (live) setUrl(value);
          else void window.assetFlow.canvasModules.unmount(value);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    } catch (e) {
      setError(String(e));
    }
    return () => {
      live = false;
      send("dispose", null);
      if (session) void window.assetFlow.canvasModules.unmount(session);
    };
  }, [payload, windowId, settingsJson]);
  useEffect(() => {
    setReady(false);
    if (!url) return;
    let live = true;
    const timeout = window.setTimeout(
      () => setError("模块启动超时，请检查 activate() 是否完成"),
      10000
    );
    const message = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== "assetflow.canvas.v1"
      )
        return;
      const { type, value } = event.data;
      if (type === "save-result") {
        const request = saveRequests.current.get(value?.requestId);
        if (request) {
          saveRequests.current.delete(value.requestId);
          clearTimeout(request.timer);
          try {
            if (value.error) throw Error(String(value.error));
            request.resolve(validateCanvasSaveResult(value));
          } catch (error) { request.reject(error instanceof Error ? error : Error(String(error))); }
        }
      }
      if (type === "drawer-tree") {
        const request = drawRequests.current.get(value?.requestId);
        if (request) {
          clearTimeout(request.timer);
          if (value.error) {
            drawRequests.current.delete(value.requestId);
            request.reject(Error(value.error));
          } else request.resolve(value.tree);
        }
      }
      if (type === "drawer-value")
        drawRequests.current.get(value?.requestId)?.change(value.value);
      if (type === "ready") {
        window.clearTimeout(timeout);
        setReady(true);
        setError("");
        send("input", inputRef.current);
      }
      if (type === "error") {
        window.clearTimeout(timeout);
        setError(String(value).slice(0, 2000));
      }
      if (type === "notice") callbacks.current.onNotice(String(value));
      if (type === "tool-dirty") window.dispatchEvent(new CustomEvent("assetflow:tool-dirty", { detail: { windowId, dirty: !!value } }));
      if (type === "resource-result" || type === "tool-result") {
        const request = requests.current.get(value?.requestId);
        if (request) {
          requests.current.delete(value.requestId);
          clearTimeout(request.timer);
          value.error ? request.reject(Error(value.error)) : request.resolve();
        }
      }
      if (type === "resource-read") {
        const resource = grants.current.get(value?.id);
        if (!resource)
          send("resource-read-result", {
            requestId: value?.requestId,
            error: "资源未授权给当前画布",
          });
        else
          void window.assetFlow.canvasModules
            .readResource(url, resource.id)
            .then((data) => {
              if (live)
                send("resource-read-result", {
                  requestId: value.requestId,
                  data,
                });
            })
            .catch((error) => {
              if (live)
                send("resource-read-result", {
                  requestId: value.requestId,
                  error: String(error),
                });
            });
      }
      if (
        type === "key" &&
        value &&
        typeof value.key === "string" &&
        value.key.length < 30
      ) {
        callbacks.current.onActivate();
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: value.key,
            ctrlKey: !!value.ctrlKey,
            metaKey: !!value.metaKey,
            altKey: !!value.altKey,
            shiftKey: !!value.shiftKey,
          })
        );
      }
      if (type === "output") {
        try {
          if (JSON.stringify(value).length > 1024 * 1024)
            throw Error("输出超过 1 MB");
          callbacks.current.onOutput(value);
        } catch (e) {
          setError(String(e));
        }
      }
      if (type === "state") {
        try {
          const json = JSON.stringify(value);
          if (json.length > 1024 * 1024) throw Error("画布状态超过 1 MB");
          localStorage.setItem(stateKey, json);
          callbacks.current.onState();
        } catch (e) {
          setError(String(e));
        }
      }
    };
    window.addEventListener("message", message);
    return () => {
      live = false;
      window.clearTimeout(timeout);
      window.removeEventListener("message", message);
      send("dispose", null);
      for (const request of requests.current.values()) {
        clearTimeout(request.timer);
        request.reject(Error("画布已关闭或正在重载"));
      }
      requests.current.clear();
      for (const request of drawRequests.current.values()) {
        clearTimeout(request.timer);
        request.reject(Error("绘制会话已关闭"));
      }
      drawRequests.current.clear();
      grants.current.clear();
      for (const request of saveRequests.current.values()) {
        clearTimeout(request.timer);
        request.reject(Error("画布已关闭或正在重载"));
      }
      saveRequests.current.clear();
    };
  }, [url, stateKey]);
  useEffect(() => {
    if (!ready || !url) return;
    return registerCanvasSaver(windowId, () => new Promise<CanvasSaveResult>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        saveRequests.current.delete(requestId);
        reject(Error("画布保存超时"));
      }, 30000);
      saveRequests.current.set(requestId, { resolve, reject, timer });
      send("save", { requestId });
    }));
  }, [ready, url, windowId]);
  useEffect(() => {
    if (ready) send("input", input);
  }, [input, ready]);
  useEffect(() => {
    if (ready) send("target", linked ? "linked" : "self");
  }, [linked, ready]);
  useEffect(() => {
    if (!ready || !payload) return;
    try {
      send(
        "canvas-properties",
        validateValues(
          payload.config.inspector?.canvas ?? [],
          preferences.properties
        )
      );
    } catch (error) {
      setError(String(error));
    }
  }, [ready, payload, JSON.stringify(preferences.properties)]);
  useEffect(() => {
    if (!ready || !payload) return;
    const fields = [
      ...(payload.config.inspector?.canvas ?? []),
      ...payload.config.tools.flatMap((tool) => tool.fields ?? []),
    ];
    return registerDrawerHost(
      windowId,
      async (field, values, change, signal) => {
        if (
          !fields.some(
            (declared) =>
              declared.id === field.id && declared.renderer === field.renderer
          )
        )
          throw Error("绘制字段未在模块配置声明");
        const requestId = crypto.randomUUID();
        const tree = await new Promise<InspectorUI>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            drawRequests.current.delete(requestId);
            send("drawer-dispose", { requestId });
            signal?.removeEventListener("abort", abort);
            reject(Error("字段绘制已取消"));
          };
          const timer = window.setTimeout(() => {
            drawRequests.current.delete(requestId);
            send("drawer-dispose", { requestId });
            signal?.removeEventListener("abort", abort);
            reject(Error("字段绘制超时"));
          }, 10000);
          drawRequests.current.set(requestId, {
            resolve: (tree) => {
              signal?.removeEventListener("abort", abort);
              resolve(tree);
            },
            reject: (error) => {
              signal?.removeEventListener("abort", abort);
              reject(error);
            },
            change,
            timer,
          });
          if (signal?.aborted) {
            abort();
            return;
          }
          signal?.addEventListener("abort", abort, { once: true });
          send("drawer-draw", { requestId, field, values });
        });
        return {
          tree,
          event: (event, value) =>
            send("drawer-event", { requestId, event, value }),
          dispose: () => {
            const request = drawRequests.current.get(requestId);
            if (request) clearTimeout(request.timer);
            drawRequests.current.delete(requestId);
            send("drawer-dispose", { requestId });
          },
        };
      }
    );
  }, [ready, payload, windowId]);
  useEffect(() => {
    if (!ready || !payload || !url || !payload.config.resources?.length) return;
    let live = true;
    let pending = Promise.resolve();
    const perform = async (refs: readonly CanvasResourceRef[]) => {
      if (!live) throw Error("画布资源入口已关闭");
      const rule = matchResourceRule(payload.config.resources ?? [], refs);
      if (!rule) throw Error("此画布未配置对应资源入口或资源数量不匹配");
      const canonical = await window.assetFlow.canvasModules.authorizeResources(
        url,
        refs.map((ref) => ref.id)
      );
      if (!live) throw Error("画布资源入口已关闭");
      const previous = new Map(grants.current);
      canonical.forEach((ref) => grants.current.set(ref.id, ref));
      try {
        await new Promise<void>((resolve, reject) => {
          const requestId = crypto.randomUUID();
          const timer = window.setTimeout(() => {
            requests.current.delete(requestId);
            reject(Error("模块打开资源超时"));
          }, 30000);
          requests.current.set(requestId, { resolve, reject, timer });
          send("resource-open", { requestId, resources: canonical });
        });
        if (!live) throw Error("画布资源入口已关闭");
        if (rule.mode === "replace")
          grants.current = new Map(canonical.map((ref) => [ref.id, ref]));
        resourceCallback.current([...grants.current.values()]);
      } catch (error) {
        if (live) grants.current = previous;
        throw error;
      }
    };
    const open = (refs: readonly CanvasResourceRef[]) => {
      const result = pending.then(() => perform(refs));
      pending = result.catch(() => {});
      return result;
    };
    const dispose = registerCanvasResourceOpener(windowId, open);
    if (resourceRefs.current.length)
      void open(resourceRefs.current).catch((error) => setError(String(error)));
    return () => {
      live = false;
      dispose();
    };
  }, [ready, payload, url, windowId]);
  useEffect(() => {
    const command = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.windowId !== windowId || !ready || !payload) return;
      if (event.type === "assetflow:command") {
        if (commandIds(payload.config).includes(detail.command))
          send("command", {
            command: detail.command,
            params: detail.params ?? {},
          });
      } else {
        const tool = payload.config.tools.find((t) => t.id === detail.tool);
        if (!tool || !["preview", "apply", "cancel"].includes(detail.phase))
          return;
        try {
          const params = detail.phase === "cancel" ? fieldDefaults(tool.fields ?? []) : validateValues(tool.fields ?? [], detail.params ?? {});
          if (detail.resolve) {
            event.preventDefault();
            const requestId = crypto.randomUUID();
            const timer = window.setTimeout(() => { requests.current.delete(requestId); detail.reject(Error("工具应用或取消超时")); }, 30000);
            requests.current.set(requestId, { resolve: detail.resolve, reject: detail.reject, timer });
            send("tool", { phase: detail.phase, tool: detail.tool, params, requestId });
          } else send("tool", { phase: detail.phase, tool: detail.tool, params });
        } catch (error) { if (detail.reject) { event.preventDefault(); detail.reject(error); } else setError(String(error)); }

      }
    };
    window.addEventListener("assetflow:command", command);
    window.addEventListener("assetflow:tool", command);
    return () => {
      window.removeEventListener("assetflow:command", command);
      window.removeEventListener("assetflow:tool", command);
    };
  }, [windowId, payload, ready]);
  return (
    <div className="extension-canvas">
      {payload && !payload.source ? (
        <div className="empty">
          <p>{payload.config.name}：尚未提供画布脚本和编辑能力</p>
        </div>
      ) : url ? (
        <iframe
          ref={frame}
          title={`${type} 扩展画布`}
          onFocus={onActivate}
          sandbox="allow-scripts"
          src={url}
        />
      ) : (
        <p>{error || "正在加载模块…"}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
