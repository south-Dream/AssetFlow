const inspectors = new Map<string, { prepare: () => Promise<void>; dirty: () => boolean }>();
export function registerCanvasSavePreparation(id: string, value: { prepare: () => Promise<void>; dirty: () => boolean }) {
  inspectors.set(id, value);
  return () => { if (inspectors.get(id) === value) inspectors.delete(id); };
}
export async function prepareCanvasSave(id: string) { await inspectors.get(id)?.prepare(); }
export function canvasInspectorDirty(id: string) { return inspectors.get(id)?.dirty() ?? false; }
