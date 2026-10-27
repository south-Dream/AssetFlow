import type { CanvasResourceRef } from "../../extensions/canvas/contracts";
const openers = new Map<
  string,
  (resources: readonly CanvasResourceRef[]) => Promise<void>
>();
const listeners = new Set<() => void>();
let revision = 0;
export const resourceHostRevision = () => revision;
export function subscribeResourceHost(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function registerCanvasResourceOpener(
  id: string,
  open: (resources: readonly CanvasResourceRef[]) => Promise<void>
) {
  openers.set(id, open);
  revision++;
  listeners.forEach((fn) => fn());
  return () => {
    if (openers.get(id) === open) {
      openers.delete(id);
      revision++;
      listeners.forEach((fn) => fn());
    }
  };
}
export function hasCanvasResourceOpener(id: string) {
  return openers.has(id);
}
export async function openCanvasResources(
  id: string,
  resources: readonly CanvasResourceRef[]
) {
  const open = openers.get(id);
  if (!open) throw Error("此画布的资源入口尚未注册或模块未就绪");
  await open(resources);
}
