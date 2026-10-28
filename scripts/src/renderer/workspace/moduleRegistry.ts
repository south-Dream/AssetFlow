import { useSyncExternalStore } from "react";
import { validateCanvasConfig } from "../../extensions/canvas/config";
import type { CanvasConfig, CanvasModuleRecord } from "../../extensions/canvas/contracts";
import { registerPanelType } from "./panelTypes";

let records: readonly CanvasModuleRecord[] = [];
const cleanup = new Map<string, () => void>();
const listeners = new Set<() => void>();
export function setModuleRecords(next: CanvasModuleRecord[]) {
  const valid = next.map((record) => ({
    ...record,
    config: validateCanvasConfig(record.config, record.config.id === "image" || record.config.id === "atlas"),
  }));
  for (const dispose of cleanup.values()) dispose();
  cleanup.clear();
  records = valid;
  for (const record of valid.filter((r) => r.enabled && !r.error))
    cleanup.set(
      record.config.id,
      registerPanelType({
        id: record.config.id,
        label: record.config.name,
        desc: record.config.desc,
      })
    );
  listeners.forEach((fn) => fn());
}
export function useModules() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => records
  );
}
export function configFor(type: string): CanvasConfig | undefined {
  return records.find((r) => r.config.id === type && r.enabled && !r.error)
        ?.config;
}
export async function refreshModules() {
  setModuleRecords(await window.assetFlow.canvasModules.list());
}
export function toolIconFor(type: string, icon?: string): string | undefined {
  if (!icon) return;
  return records.find(
    (record) => record.config.id === type && record.enabled && !record.error
  )?.iconData?.[icon];
}
