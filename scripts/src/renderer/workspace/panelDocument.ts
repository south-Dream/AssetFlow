import type { Step, PanelSnapshot } from "../../shared";

export function panelFingerprint(snapshot: PanelSnapshot): string {
  return JSON.stringify([
    snapshot.sourcePath,
    snapshot.mode,
    snapshot.steps,
    snapshot.canvasProperties ?? {},
  ]);
}
export function panelIsDirty(
  current: PanelSnapshot | undefined,
  saved: PanelSnapshot | undefined
): boolean {
  return (
    !!current &&
    (!saved || panelFingerprint(current) !== panelFingerprint(saved))
  );
}
export function visiblePanelSteps(
  steps: Step[],
  saved: PanelSnapshot | undefined,
  showHistory: boolean
): Step[] {
  if (showHistory || !saved) return steps;
  const committed = new Set(saved.steps.map((step) => step.id));
  return steps.filter((step) => !committed.has(step.id));
}
