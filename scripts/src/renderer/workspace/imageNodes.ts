import type React from "react";
import { ToolNode } from "../../../extensions/sdk/nodes";

class ImageToolNode extends ToolNode<{ render(): React.ReactNode }, React.ReactNode> {
  select: () => void | Promise<void> = () => {};
  constructor(readonly name: string) {
    super(undefined, { selectTool: (node: ImageToolNode) => node.select() });
  }
  draw(context: { render(): React.ReactNode }) { return context.render(); }
}
const nodes = new Map<string, Map<string, ImageToolNode>>();
export function imageToolNode(windowId: string, id: string, name = id) {
  if (!nodes.has(windowId)) nodes.set(windowId, new Map());
  const canvas = nodes.get(windowId)!;
  if (!canvas.has(id)) canvas.set(id, new ImageToolNode(name));
  return canvas.get(id)!;
}
export function releaseImageNodes(windowId: string) { nodes.delete(windowId); }
