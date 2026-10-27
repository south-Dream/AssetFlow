export type WindowMode = string;
export type CanvasType = "image" | "atlas" | "audio" | "video" | "animation" | "data" | "blueprint";
export type PanelId = "hierarchy" | "inspector";
export interface WorkspaceSettings { maxCanvasCount: number; }
export interface WorkspaceWindow {
  readOnly?: boolean;
  id: string;
  title: string;
  mode: WindowMode;
  bounds: { x: number; y: number; width: number; height: number };
}

export type DockPanelId = "inspector" | `hierarchy:${string}` | `canvas:${string}` | `extension:${string}`;
export type DockNode =
  | { kind: "tabs"; id: string; panels: DockPanelId[]; active: DockPanelId }
  | { kind: "split"; id: string; axis: "horizontal" | "vertical"; ratio: number; first: DockNode; second: DockNode };

export function createDockNode(panel: DockPanelId): DockNode {
  return { kind: "tabs", id: crypto.randomUUID(), panels: [panel], active: panel };
}

export function removeDockPanel(node: DockNode, panel: DockPanelId): DockNode | null {
  if (node.kind === "tabs") {
    const panels = node.panels.filter((item) => item !== panel);
    if (!panels.length) return null;
    return { ...node, panels, active: node.active === panel ? panels[0] : node.active };
  }
  const first = removeDockPanel(node.first, panel);
  const second = removeDockPanel(node.second, panel);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function insertDockPanel(node: DockNode, panel: DockPanelId, targetId: string, zone: "center" | "left" | "right" | "top" | "bottom"): DockNode {
  if (node.id === targetId) {
    if (node.kind === "tabs" && node.panels.includes(panel)) return { ...node, active: panel };
    if (zone === "center" && node.kind === "tabs") return { ...node, panels: [...node.panels, panel], active: panel };
    const added = createDockNode(panel);
    const before = zone === "left" || zone === "top";
    return { kind: "split", id: crypto.randomUUID(), axis: zone === "left" || zone === "right" ? "horizontal" : "vertical", ratio: 0.5, first: before ? added : node, second: before ? node : added };
  }
  if (node.kind === "tabs") return node;
  const first = insertDockPanel(node.first, panel, targetId, zone);
  if (first !== node.first) return { ...node, first };
  const second = insertDockPanel(node.second, panel, targetId, zone);
  return second === node.second ? node : { ...node, second };
}

export function moveDockPanel(node: DockNode, panel: DockPanelId, targetId: string, zone: "center" | "left" | "right" | "top" | "bottom"): DockNode {
  const target = findDockNode(node, targetId);
  if (!target) return node;
  if (target.kind === "tabs" && target.panels.includes(panel)) {
    if (zone === "center") return activateDockPanel(node, targetId, panel);
    if (target.panels.length === 1) return node;
  }
  const without = removeDockPanel(node, panel);
  if (!without) return node;
  if (!findDockNode(without, targetId)) return node;
  return insertDockPanel(without, panel, targetId, zone);
}

export function findDockNode(node: DockNode, id: string): DockNode | null {
  if (node.id === id) return node;
  if (node.kind === "tabs") return null;
  return findDockNode(node.first, id) ?? findDockNode(node.second, id);
}

export function firstDockPanel(node: DockNode, predicate: (panel: DockPanelId) => boolean): DockPanelId | null {
  if (node.kind === "tabs") return node.panels.find(predicate) ?? null;
  return firstDockPanel(node.first, predicate) ?? firstDockPanel(node.second, predicate);
}

export function resizeDockSplit(node: DockNode, splitId: string, ratio: number): DockNode {
  if (node.kind === "tabs") return node;
  if (node.id === splitId) return { ...node, ratio: Math.max(.12, Math.min(.88, ratio)) };
  const first = resizeDockSplit(node.first, splitId, ratio);
  if (first !== node.first) return { ...node, first };
  const second = resizeDockSplit(node.second, splitId, ratio);
  return second === node.second ? node : { ...node, second };
}

export function dockPanelCount(node: DockNode, panel: DockPanelId): number {
  if (node.kind === "tabs") return node.panels.filter((item) => item === panel).length;
  return dockPanelCount(node.first, panel) + dockPanelCount(node.second, panel);
}

export function openDockPanel(node: DockNode, panel: DockPanelId): DockNode {
  const focus = (current: DockNode): DockNode => current.kind === "tabs"
    ? (current.panels.includes(panel) ? { ...current, active: panel } : current)
    : { ...current, first: focus(current.first), second: focus(current.second) };
  return dockPanelCount(node, panel) ? focus(node) : insertDockPanel(node, panel, node.id, "center");
}

export function mapDockPanel(node: DockNode, from: DockPanelId, to: DockPanelId): DockNode {
  if (node.kind === "tabs") return { ...node, panels: node.panels.map((panel) => panel === from ? to : panel), active: node.active === from ? to : node.active };
  return { ...node, first: mapDockPanel(node.first, from, to), second: mapDockPanel(node.second, from, to) };
}

export function activateDockPanel(node: DockNode, groupId: string, panel: DockPanelId): DockNode {
  if (node.id === groupId && node.kind === "tabs" && node.panels.includes(panel)) return { ...node, active: panel };
  if (node.kind === "tabs") return node;
  const first = activateDockPanel(node.first, groupId, panel);
  if (first !== node.first) return { ...node, first };
  const second = activateDockPanel(node.second, groupId, panel);
  return second === node.second ? node : { ...node, second };
}

export function createWindow(index: number, mode: WindowMode = "image"): WorkspaceWindow {
  return {
    id: crypto.randomUUID(),
    title: `面板 ${index + 1}`,
    mode,
    bounds: { x: 16 + index % 5 * 28, y: 16 + index % 5 * 28, width: 540, height: 460 },
  };
}

export function validateWindowLimit(value: number, count: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 16) return "窗口上限必须是 1 到 16 的整数";
  if (value < count) return `当前有 ${count} 个窗口，请先关闭多余窗口`;
  return null;
}

export function createDefaultSettings(): WorkspaceSettings { return { maxCanvasCount: 2 }; }
