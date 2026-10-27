import React, { useEffect, useRef, useState } from "react";
export type ToolSwitchChoice = "apply" | "discard" | "cancel";
type Request = { current: string; next: string; error: () => string; resolve: (choice: ToolSwitchChoice) => void };
export function confirmToolSwitch(current: string, next: string, error: () => string): Promise<ToolSwitchChoice> {
  return new Promise(resolve => { const event = new CustomEvent("assetflow:confirm-tool-switch", { cancelable: true, detail: { current, next, error, resolve } }); window.dispatchEvent(event); if (!event.defaultPrevented) resolve("cancel"); });
}
export function sameToolParams(first: Record<string, unknown>, second: Record<string, unknown>): boolean {
  const normalized = (value: Record<string, unknown>) => JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]));
  return normalized(first) === normalized(second);
}
export function sendToolPhase(windowId: string, tool: string, params: Record<string, unknown>, phase: "apply" | "cancel"): Promise<void> {
  return new Promise((resolve, reject) => { const event = new CustomEvent("assetflow:tool", { cancelable: true, detail: { windowId, tool, params, phase, resolve, reject } }); window.dispatchEvent(event); if (!event.defaultPrevented) reject(Error("当前工具尚未就绪")); });
}
export function ToolSwitchDialog() {
  const [request, setRequest] = useState<Request>(); const active = useRef<Request | undefined>(undefined); active.current = request;
  useEffect(() => { const receive = (event: Event) => { event.preventDefault(); const next = (event as CustomEvent<Request>).detail; if (active.current) next.resolve("cancel"); else { active.current = next; setRequest(next); } }; window.addEventListener("assetflow:confirm-tool-switch", receive); return () => { window.removeEventListener("assetflow:confirm-tool-switch", receive); active.current?.resolve("cancel"); }; }, []);
  if (!request) return null;
  const choose = (choice: ToolSwitchChoice) => { request.resolve(choice); active.current = undefined; setRequest(undefined); };
  const error = request.error();
  return <div className="settings-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="切换编辑工具"><h3>是否应用当前修改？</h3><p>“{request.current}”有尚未应用的修改。切换到“{request.next}”前，可以应用或放弃本次修改。</p>{error && <p role="alert">{error}</p>}<div className="tool-switch-actions"><button disabled={!!error} onClick={() => choose("apply")}>应用并切换</button><button onClick={() => choose("discard")}>放弃修改并切换</button><button onClick={() => choose("cancel")}>取消</button></div></section></div>;
}
