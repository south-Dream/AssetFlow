import type { PanelSnapshot } from "../shared";
import { validateSteps } from "../core/registry";
import { validateImportPaths } from "../shared/importPaths";
import { validatePropertyValues } from "../extensions/canvas/config";

export function validatePanelSnapshot(input: any): PanelSnapshot {
  if (
    input?.version !== 1 ||
    typeof input.mode !== "string" ||
    !input.mode.trim() ||
    input.mode.length > 100
  )
    throw Error("面板配置格式无效");
  validateImportPaths([input.sourcePath], process.platform);
  return {
    version: 1,
    sourcePath: input.sourcePath,
    mode: input.mode,
    steps: validateSteps(input.steps),
    ...(input.canvasProperties === undefined
      ? {}
      : { canvasProperties: validatePropertyValues(input.canvasProperties) }),
  };
}
