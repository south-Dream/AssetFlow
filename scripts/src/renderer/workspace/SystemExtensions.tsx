import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { NavigationItem, PanelHost, SystemExtensionRecord } from "../../../extensions/sdk/contracts";
import type { CanvasValues } from "../../extensions/canvas/contracts";
import { CanvasFields } from "./CanvasFields";
import { composeNavigation, SystemNavigationContainer, assembleSystemNavigation } from "../../extensions/navigation";
import { builtinNavigation } from "../../extensions/system/config";
import { type MenuEntry } from "./MainMenu";
import { NavigationContainer } from "./NavigationContainer";

let records: SystemExtensionRecord[] = [];
let initialized: Promise<void> | undefined;
const listeners = new Set<() => void>();
const commands = new Map<string, (command: string) => void>();
const report = (message: string) => window.dispatchEvent(new CustomEvent("assetflow:system-notice", { detail: message }));
export function initializeSystemExtensions() {
  if (!window.assetFlow.systemExtensions) return Promise.resolve();
  return initialized ??= window.assetFlow.systemExtensions.snapshot().then(next => { records = next; listeners.forEach(fn => fn()); const failures = next.filter(record => record.error); if (failures.length) report(failures.map(record => record.folder + ": " + record.error).join("；")); }).catch(error => { report(String(error)); });
}
export function useSystemExtensions() {
  useEffect(() => { void initializeSystemExtensions(); }, []);
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => records);
}
export function openExtensionPanel(panel: string, host: PanelHost = "dialog") {
  if (!["dialog", "settings", "dock"].includes(host) || !records.some(record => !record.error && record.config?.panels.some(item => item.id === panel))) { report("扩展面板未注册: " + panel); return; }
  window.dispatchEvent(new CustomEvent("assetflow:open-system-panel", { detail: { panel, host } }));
}
export function navigationEntries(items: NavigationItem[], execute: (command: string) => void): MenuEntry[] {
  return items.map(item => ({ id: item.id, label: item.name, ...(item.children ? { children: navigationEntries(item.children, execute) } : { action: () => item.action ? openExtensionPanel(item.action.panel, item.action.host) : execute(item.command!) }) }));
}
export function extendMenuEntries(base: MenuEntry[], additions: NavigationItem[], execute: (command: string) => void): MenuEntry[] {
  const handlers = new Map<string, MenuEntry>();
  const describe = (items: MenuEntry[], parent = "system"): NavigationItem[] => items.map((item, index) => {
    const id = item.id ?? `${parent}.generated.${index}`; handlers.set(id, item);
    return { id, name: item.label, ...(item.children ? { children: describe(item.children, id) } : { command: id }) };
  });
  const merged = composeNavigation(describe(base), additions);
  const materialize = (items: NavigationItem[]): MenuEntry[] => items.map(item => {
    const original = handlers.get(item.id);
    return { id: item.id, label: item.name, checked: original?.checked, ...(item.children ? { children: materialize(item.children) } : { action: original?.action ?? (() => item.action ? openExtensionPanel(item.action.panel, item.action.host) : execute(item.command!)) }) };
  });
  return materialize(merged);
}
export function ApplicationNavigation({ commands: systemCommands, canvases }: { commands: Record<string, () => void>; canvases: MenuEntry[] }) {
  const installed = useSystemExtensions();
  const handlers = new Map<string, () => void>(Object.entries(systemCommands));
  const base: NavigationItem[] = structuredClone(builtinNavigation);
  base.find(item => item.id === "system.edit")!.children!.find(item => item.id === "system.edit.newCanvas")!.children = canvases.map(item => ({ id: item.id!, name: item.label, command: item.id! }));
  canvases.forEach(item => { if (item.action) handlers.set(item.id!, item.action); });
  const aggregate = assembleSystemNavigation(base, installed.filter(record => !record.error && record.config).map(record => record.config!));
  const diagnostic = aggregate.errors.join("；");
  useEffect(() => { if (diagnostic) report(diagnostic); }, [diagnostic]);
  return <NavigationContainer container={new SystemNavigationContainer()} layout={aggregate.layout} entries={navigationEntries(aggregate.nodes, command => {
    const builtin = handlers.get(command); if (builtin) { builtin(); return; }
    const owner = installed.find(record => record.config && command.startsWith(record.config.id + "."))?.config?.id;
    const run = owner && commands.get(owner); if (run) run(command); else report("扩展尚未就绪: " + command);
  })} />;
}

function SystemFrame({ record, panel, host = "dialog", values = {} }: { record: SystemExtensionRecord; panel?: string; host?: PanelHost; values?: CanvasValues }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState(""); const [error, setError] = useState("");
  const bootValues = useRef(values); bootValues.current = values;
  useEffect(() => {
    const bridge = window.assetFlow.systemExtensions; if (!bridge || !record.config) return;
    let live = true, session = ""; const id = record.config.id;
    const send = (type: string, value?: unknown) => frame.current?.contentWindow?.postMessage({ assetflowSystemHost: true, type, value }, "*");
    const run = (command: string) => send("command", command);
    const timeout = window.setTimeout(() => setError("系统扩展启动超时"), 15000);
    const receive = (event: MessageEvent) => {
      if (!live || event.source !== frame.current?.contentWindow || !event.data?.assetflowSystem) return;
      const { type, value } = event.data;
      if (type === "ready") { clearTimeout(timeout); if (panel) send("show", { panel, host, values: bootValues.current }); else commands.set(id, run); }
      if (type === "error" || type === "panelError") { clearTimeout(timeout); setError(String(value).slice(0, 2000)); report(`${record.config!.name}: ${value}`); }
      if (type === "notice") report(String(value).slice(0, 2000));
      if (type === "openPanel" && record.config!.panels.some(item => item.id === value?.panel)) openExtensionPanel(value.panel, value.host);
      if (type === "saveValues" || type === "getValues") {
        if (!record.config!.panels.some(panel => panel.id === value?.panel)) { send("reply", { id: value?.id, error: "面板配置未授权" }); return; }
        const request = type === "getValues" ? bridge.values(value.panel) : bridge.saveValues(value.panel, value.values);
        void request.then(values => { if (live) { send("reply", { id: value.id, values }); if (type === "saveValues") window.dispatchEvent(new CustomEvent("assetflow:system-values", { detail: { panel: value.panel, values } })); } }).catch(error => { if (live) send("reply", { id: value.id, error: String(error) }); });
      }
    };
    window.addEventListener("message", receive);
    const valuesChanged = (event: Event) => { const detail = (event as CustomEvent).detail; if (record.config!.panels.some(panel => panel.id === detail.panel)) send("valuesChanged", detail); };
    window.addEventListener("assetflow:system-values", valuesChanged);
    void bridge.mount(id).then(next => { session = next; if (live) setUrl(next); else void bridge.unmount(next); }).catch(error => setError(String(error)));
    return () => { live = false; clearTimeout(timeout); if (commands.get(id) === run) commands.delete(id); send("hide"); window.removeEventListener("message", receive); window.removeEventListener("assetflow:system-values", valuesChanged); if (session) void bridge.unmount(session); };
  }, [record, panel, host]);
  return <>{url && <iframe ref={frame} src={url} sandbox="allow-scripts" title={panel ?? `系统扩展 ${record.folder}`} className="system-extension-frame" />}{error && <p role="alert">{error}</p>}</>;
}
export function SystemExtensionRuntimes() {
  const installed = useSystemExtensions();
  return <div hidden>{installed.filter(record => !record.error && record.config?.entry).map(record => <SystemFrame key={record.folder} record={record} />)}</div>;
}
export function ExtensionPanelView({ panelId, host }: { panelId: string; host: PanelHost }) {
  const installed = useSystemExtensions();
  const record = installed.find(record => !record.error && record.config?.panels.some(panel => panel.id === panelId));
  const panel = record?.config?.panels.find(panel => panel.id === panelId);
  const [values, setValues] = useState<CanvasValues>(); const [error, setError] = useState("");
  const writes = useRef(Promise.resolve());
  const pendingWrites = useRef(0);
  useEffect(() => {
    let live = true; setValues(undefined); setError("");
    void window.assetFlow.systemExtensions?.values(panelId).then(values => { if (live) setValues(values); }).catch(error => { if (live) setError(String(error)); });
    const changed = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.panel === panelId && pendingWrites.current === 0) setValues(detail.values); };
    window.addEventListener("assetflow:system-values", changed);
    return () => { live = false; window.removeEventListener("assetflow:system-values", changed); };
  }, [panelId]);
  if (!record || !panel) return <p role="alert">扩展面板不可用</p>;
  return <div className="extension-panel-view" aria-label={panel.name}>{error && <p role="alert">{error}</p>}{values && (panel.renderer === "custom" ? <SystemFrame record={record} panel={panelId} host={host} values={values} /> : <div className="parameters"><CanvasFields windowId={`system:${panelId}`} fields={panel.fields} values={values} onChange={next => {
    setValues(next); pendingWrites.current++; writes.current = writes.current.then(async () => {
      await window.assetFlow.systemExtensions!.saveValues(panelId, next);
      window.dispatchEvent(new CustomEvent("assetflow:system-values", { detail: { panel: panelId, values: next } }));
      setError("");
    }).catch(error => setError(String(error))).finally(() => { pendingWrites.current--; });
  }} /></div>)}</div>;
}
export function SystemExtensionStatus() {
  const installed = useSystemExtensions();
  return <article><strong>系统扩展（启动时加载）</strong><p>scripts/extensions/system_modules；新增、修改或删除后重启生效。</p>{installed.length ? installed.map(record => <p key={record.folder}>{record.config?.name ?? record.folder}：{record.error ?? "已加载"}</p>) : <p>未发现系统扩展</p>}</article>;
}
