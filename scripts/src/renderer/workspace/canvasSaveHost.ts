import type { CanvasSaveResult } from "../../extensions/canvas/contracts";
const savers = new Map<string, () => Promise<CanvasSaveResult>>();
export const MAX_CANVAS_SAVE_BYTES = 128 * 1024 * 1024;
export function validateCanvasSaveResult(value: unknown): CanvasSaveResult {
  const result = value as Partial<CanvasSaveResult> | null;
  if (!result || !(result.data instanceof ArrayBuffer)) throw Error("画布保存必须返回 ArrayBuffer 数据");
  if (result.data.byteLength > MAX_CANVAS_SAVE_BYTES) throw Error("画布保存数据超过 128 MB");
  if (result.name !== undefined && (typeof result.name !== "string" || !result.name.trim() || result.name.length > 255 || /[\\/:*?"<>|\u0000-\u001f]/.test(result.name) || /[. ]$/.test(result.name))) throw Error("画布保存名称无效");
  return { data: result.data, ...(result.name === undefined ? {} : { name: result.name }) };
}
export function registerCanvasSaver(windowId: string, save: () => Promise<CanvasSaveResult>) {
  savers.set(windowId, save);
  return () => { if (savers.get(windowId) === save) savers.delete(windowId); };
}
export async function saveCanvas(windowId: string): Promise<CanvasSaveResult> {
  const save = savers.get(windowId);
  if (!save) throw Error("画布保存入口未注册或模块尚未就绪");
  return validateCanvasSaveResult(await save());
}
