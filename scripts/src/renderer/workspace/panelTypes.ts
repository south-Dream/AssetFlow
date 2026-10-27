import type { ComponentType } from "react";

export type PanelType = {
  id: string;
  label: string;
  desc?: string;
  /** Rendered in the right side of the toolbar, separately for every window. */
  tools?: ComponentType<{ windowId: string }>;
};

let types: readonly PanelType[] = [
  { id: "image", label: "img" },
  { id: "audio", label: "audio" },
  { id: "atlas", label: "atlas" },
  { id: "video", label: "video" },
  { id: "flow", label: "flow" },
];
const listeners = new Set<() => void>();
export const getPanelTypes = () => types;
export function subscribePanelTypes(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Registration updates already mounted menus. Returns cleanup for extensions. */
export function registerPanelType(type: PanelType): () => void {
  if (
    !type.id.trim() ||
    !type.label.trim() ||
    types.some((entry) => entry.id === type.id)
  )
    throw Error(`重复或无效的面板类型：${type.id}`);
  const entry = { ...type };
  types = [...types, entry];
  listeners.forEach((listener) => listener());
  return () => {
    types = types.filter((item) => item !== entry);
    listeners.forEach((listener) => listener());
  };
}
