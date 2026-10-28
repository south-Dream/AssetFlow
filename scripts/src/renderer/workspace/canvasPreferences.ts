import { useSyncExternalStore } from "react";
import { configFor } from "./moduleRegistry";
import type { CanvasValues } from "../../extensions/canvas/contracts";
export type CanvasPreferences = {
  visible: boolean;
  hidden: string[];
  shown: string[];
  order: string[];
  shortcuts: Record<string, string>;
  settings: CanvasValues;
  properties: CanvasValues;
};
const defaults = (): CanvasPreferences => ({
  visible: true,
  hidden: [],
  shown: [],
  order: [],
  shortcuts: {},
  settings: {},
  properties: {},
});
const cache = new Map<string, CanvasPreferences>();
const listeners = new Set<() => void>();
function preferenceKey(type: string, windowId?: string) {
  return windowId
    ? `assetflow.canvas.panel.${windowId}.${type}`
    : `assetflow.canvas.${type}`;
}
export function getCanvasPreferences(
  type: string,
  windowId?: string
): CanvasPreferences {
  const key = preferenceKey(type, windowId);
  if (!cache.has(key)) {
    const base = windowId ? getCanvasPreferences(type) : defaults();
    let stored: Partial<CanvasPreferences> = {};
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {}
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      stored = {};
    const strings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
    cache.set(key, {
      ...defaults(),
      visible:
        stored.visible === undefined ? base.visible : stored.visible !== false,
      hidden: strings(stored.hidden ?? base.hidden),
      shown: strings(stored.shown ?? base.shown),
      order: strings(stored.order ?? base.order),
      shortcuts:
        stored.shortcuts && typeof stored.shortcuts === "object"
          ? stored.shortcuts
          : { ...base.shortcuts },
      settings:
        stored.settings && typeof stored.settings === "object"
          ? stored.settings
          : { ...base.settings },
      properties:
        stored.properties && typeof stored.properties === "object"
          ? stored.properties
          : { ...base.properties },
    });
  }
  return cache.get(key)!;
}
export function setCanvasPreferences(
  type: string,
  patch: Partial<CanvasPreferences>,
  windowId?: string
) {
  const next = { ...getCanvasPreferences(type, windowId), ...patch };
  const key = preferenceKey(type, windowId);
  localStorage.setItem(key, JSON.stringify(next));
  cache.set(key, next);
  listeners.forEach((fn) => fn());
}
export function useCanvasPreferences(type: string, windowId?: string) {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => getCanvasPreferences(type, windowId)
  );
}
export function openCanvasSettings(
  type: string,
  section = "settings",
  windowId?: string
) {
  window.dispatchEvent(
    new CustomEvent("assetflow:settings", {
      detail: { type, section, windowId },
    })
  );
}
export function runCanvasCommand(windowId: string, command: string) {
  const type = command.split(".")[0];
  const isTool = configFor(type)?.tools.some(tool => tool.command === command);
  window.dispatchEvent(
    new CustomEvent(isTool ? "assetflow:command-request" : "assetflow:command", { detail: { windowId, command } })
  );
}
export function acceptCanvasCommand(windowId: string, command: string, params?: CanvasValues) { window.dispatchEvent(new CustomEvent("assetflow:command", { detail: { windowId, command, params } })); }
export function orderTools<T extends { id: string }>(
  tools: readonly T[],
  order: string[]
): T[] {
  return [...tools].sort((a, b) => {
    const ai = order.indexOf(a.id),
      bi = order.indexOf(b.id);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
  });
}
