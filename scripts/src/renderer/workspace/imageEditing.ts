import type { ImageDocument } from "../ImageWorkspace";
import { validateSteps } from "../../core/registry";
import { sameToolParams } from "./toolSwitch";
/** Restore the remaining last operation, including the inspector selection. */
export function restoreImageInspector(document: ImageDocument): ImageDocument {
  const step = document.steps.at(-1);
  return { ...structuredClone(document), activeStepId: step?.id ?? "", editing: step ? {
    draft: structuredClone(step), prefix: structuredClone(document.steps.slice(0, -1)), fresh: false,
    initialParams: structuredClone(step.params),
  } : null };
}
export function imageDraftChanged(document: ImageDocument): boolean {
  const edit = document.editing;
  return !!edit && (edit.initialParams ? !sameToolParams(edit.draft.params, edit.initialParams) : !!edit.dirty);
}
export function imageDraftError(document: ImageDocument): string {
  const edit = document.editing;
  if (!edit) return "";
  try {
    validateSteps([edit.draft]);
  } catch (error) {
    return String(error);
  }
  const { processor, params: p } = edit.draft;
  if (["crop", "resize"].includes(processor)) {
    if (!edit.inputSize) return "正在读取输入图片尺寸…";
    if (
      ![p.width, p.height].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 32768
      ) ||
      p.width * p.height > 100_000_000
    )
      return "尺寸必须为有效整数且不超过图片处理限制";
    if (
      processor === "crop" &&
      (![p.left, p.top].every(
        (value) => Number.isInteger(value) && value >= 0
      ) ||
        p.left + p.width > edit.inputSize.width ||
        p.top + p.height > edit.inputSize.height)
    )
      return "裁剪范围超出输入图片边界";
  }
  else if (edit.validation?.key !== JSON.stringify(edit.draft) || edit.validation.status === "pending") return "正在校验操作预览…";
  else if (edit.validation.status === "invalid") return edit.validation.error || "操作预览失败，请调整参数或取消";
  return "";
}
export function finishImageEdit(
  document: ImageDocument,
  apply: boolean
): ImageDocument {
  const editing = document.editing;
  if (!editing) return document;
  if (apply && imageDraftError(document)) return document;
  return {
    ...document,
    steps: !apply
      ? document.steps
      : editing.fresh
      ? [...document.steps, editing.draft]
      : document.steps.map((step) =>
          step.id === editing.draft.id ? editing.draft : step
        ),
    activeStepId: "",
    editing: null,
  };
}
