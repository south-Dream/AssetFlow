import type { Hierarchy } from "./hierarchy";
import type { WorkspaceWindow } from "./model";
import type { Asset } from "../../shared";
import type { CanvasTool, CanvasValues } from "../../extensions/canvas/contracts";

type Update<T> = T | ((old: T) => T);
class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = () => this.value;
  set = (update: Update<T>) => {
    const next = typeof update === "function" ? (update as (old: T) => T)(this.value) : update;
    if (Object.is(next, this.value)) return;
    this.value = next; this.listeners.forEach(listener => listener());
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

export type OperationDisplay = { tool?: CanvasTool; params: CanvasValues; error: string; busy: boolean };
const emptyOperation: OperationDisplay = Object.freeze({ params: {}, error: "", busy: false });
/** Display state only. Canvas owns operations, registrations and disposal. */
class InspectorManager {
  private static singleton = new InspectorManager();
  static get instance() { return this.singleton; }
  private constructor() {}
  readonly selection = new Store<string>("");
  private operations = new Map<string, Store<OperationDisplay>>();
  operation(id: string) {
    if (!this.operations.has(id)) this.operations.set(id, new Store(emptyOperation));
    return this.operations.get(id)!;
  }
  select(id: string) { this.selection.set(id); }
  clear(id: string) { this.operation(id).set(emptyOperation); }
}
export const InspectorMgr = InspectorManager.instance;

export type CanvasActions = { save(): Promise<boolean>; undo(): Promise<void> | void; clear(): Promise<void> | void };
/** Application-owned canvas registry. Only one source of selected canvas identity. */
class CanvasManager {
  private static singleton = new CanvasManager();
  static get instance() { return this.singleton; }
  private constructor() {}
  readonly canvases = new Store<WorkspaceWindow[]>([]);
  readonly selected = new Store<string>("");
  private actions = new Map<string, CanvasActions>();
  select(id: string) {
    if (id && !this.canvases.get().some(canvas => canvas.id === id)) return;
    this.selected.set(id); InspectorMgr.select(id);
  }
  reconcile() { for (const id of this.actions.keys()) if (!this.canvases.get().some(canvas => canvas.id === id)) this.unbind(id); }
  bind(id: string, actions: CanvasActions) { this.actions.set(id, actions); }
  unbind(id: string) { this.actions.delete(id); InspectorMgr.clear(id); }
  async save(id = this.selected.get()) { return await this.actions.get(id)?.save() ?? false; }
  async saveAll() {
    const failed: string[] = [];
    for (const canvas of [...this.canvases.get()]) if (!canvas.readOnly) {
      try { if (!await this.save(canvas.id)) failed.push(canvas.title); }
      catch (error) { failed.push(`${canvas.title}: ${error}`); }
    }
    if (failed.length) throw Error(`Some canvases could not be saved: ${failed.join(", ")}`);
  }
  async undo(id = this.selected.get()) { await this.actions.get(id)?.undo(); }
  async clear(id = this.selected.get()) { await this.actions.get(id)?.clear(); }
}
export const CanvasMgr = CanvasManager.instance;

/** Assets belong to the hierarchy, never to the inspector or canvas history. */
class HierarchyManager {
  private static singleton = new HierarchyManager();
  static get instance() { return this.singleton; }
  private constructor() {}
  readonly assets = new Store<Asset[]>([]);
  readonly hierarchies = new Store<Hierarchy[]>([]);
}
export const HierarchyMgr = HierarchyManager.instance;

/** History includes the selected operation so undo restores its inspector too. */
export class CanvasHistory<T> {
  private entries: T[] = [];
  private current?: string;
  reset(value: T) { this.entries = []; this.current = JSON.stringify(value); }
  commit(before: T, after: T) {
    const next = JSON.stringify(after);
    if (JSON.stringify(before) === next) return;
    this.entries.push(structuredClone(before)); this.current = next;
  }
  undo(): T | undefined {
    const previous = this.entries.pop();
    if (previous !== undefined) this.current = JSON.stringify(previous);
    return previous;
  }
}
