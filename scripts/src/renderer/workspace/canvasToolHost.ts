import type { CanvasValues } from "../../extensions/canvas/contracts";

const readers = new Map<string, (toolId: string) => CanvasValues>();
export function registerCanvasToolParams(windowId: string, reader: (toolId: string) => CanvasValues) {
  readers.set(windowId, reader);
  return () => { if (readers.get(windowId) === reader) readers.delete(windowId); };
}
export function getCanvasToolParams(windowId: string, toolId: string, fallback: CanvasValues): CanvasValues {
  return { ...fallback, ...(readers.get(windowId)?.(toolId) ?? {}) };
}
