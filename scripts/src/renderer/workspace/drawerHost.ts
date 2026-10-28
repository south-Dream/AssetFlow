import type {
  ConfigField,
  CanvasValues,
  InspectorUI,
} from "../../extensions/canvas/contracts";
export type DrawerSession = {
  tree: InspectorUI;
  event: (id: string, value?: unknown) => void;
  dispose: () => void;
};
export type DrawRequest = (
  field: ConfigField,
  values: CanvasValues,
  change: (value: string | number | boolean) => void,
  signal?: AbortSignal
) => Promise<DrawerSession>;
const hosts = new Map<string, DrawRequest>(),
  listeners = new Set<() => void>();
let revision = 0;
export const drawerRevision = () => revision;
export function invalidateDrawers() {
  revision++;
  listeners.forEach(fn => fn());
}
export const subscribeDrawers = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function registerDrawerHost(windowId: string, draw: DrawRequest) {
  hosts.set(windowId, draw);
  revision++;
  listeners.forEach((fn) => fn());
  return () => {
    if (hosts.get(windowId) === draw) {
      hosts.delete(windowId);
      revision++;
      listeners.forEach((fn) => fn());
    }
  };
}
export function drawField(
  windowId: string,
  field: ConfigField,
  values: CanvasValues,
  change: (value: string | number | boolean) => void,
  signal?: AbortSignal
) {
  const host = hosts.get(windowId);
  if (!host) return Promise.reject(Error("模块绘制器尚未就绪"));
  return host(field, values, change, signal);
}
