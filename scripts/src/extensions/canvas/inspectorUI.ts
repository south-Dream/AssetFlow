import type { InspectorUI } from "./contracts";
/** Treat Drawer output as data. Invalid custom fields must never crash the host. */
export function validateInspectorUI(
  input: unknown
): asserts input is InspectorUI {
  let count = 0;
  const visit = (node: any, depth: number) => {
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      depth > 8 ||
      ++count > 200
    )
      throw Error("无效或超限的绘制描述");
    if (
      !["text", "input", "slider", "button", "row", "column"].includes(
        node.kind
      )
    )
      throw Error("未知绘制控件");
    if (
      node.event !== undefined &&
      (typeof node.event !== "string" || node.event.length > 200)
    )
      throw Error("无效绘制事件");
    if (
      node.text !== undefined &&
      (typeof node.text !== "string" || node.text.length > 2000)
    )
      throw Error("无效绘制文字");
    if (
      node.kind === "input" &&
      !["string", "number"].includes(typeof node.value)
    )
      throw Error("无效输入值");
    if (typeof node.value === "number" && !Number.isFinite(node.value))
      throw Error("无效数值");
    if (
      node.kind === "slider" &&
      (![node.value, node.min, node.max].every(Number.isFinite) ||
        node.min > node.max ||
        (node.step !== undefined &&
          (!Number.isFinite(node.step) || node.step <= 0)))
    )
      throw Error("无效滑条参数");
    if (["row", "column"].includes(node.kind)) {
      if (!Array.isArray(node.children) || node.children.length > 100)
        throw Error("无效绘制子项");
      node.children.forEach((child: unknown) => visit(child, depth + 1));
    }
  };
  visit(input, 0);
}
