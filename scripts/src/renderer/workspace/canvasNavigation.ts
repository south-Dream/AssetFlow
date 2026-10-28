import { ActionNavNode } from "../../../extensions/sdk/nodes";
import type { MenuEntry } from "./MainMenu";
import { CanvasMgr } from "./managers";
import { openCanvasSettings, runCanvasCommand } from "./canvasPreferences";
import type { CanvasTool } from "../../extensions/canvas/contracts";

export function canvasEditNodes(windowId: string, type: string, typeMenu: MenuEntry): MenuEntry {
  const action = (id: string, name: string, trigger: () => void | Promise<void>): MenuEntry => {
    const node = new ActionNavNode(name, trigger);
    return { id, label: node.name, action: () => { void Promise.resolve(node.trigger()).catch(error =>
      window.dispatchEvent(new CustomEvent("assetflow:system-notice", { detail: String(error) }))); } };
  };
  return { id: "system.edit", label: "编辑", children: [
    action("system.canvas.save", "保存    Ctrl+S", async () => { await CanvasMgr.save(windowId); }),
    action("system.canvas.undo", "撤销    Ctrl+Z", () => CanvasMgr.undo(windowId)),
    action("system.canvas.clear", "清空", () => CanvasMgr.clear(windowId)),
    typeMenu,
    // Structurally last; extension order can never displace this host-owned node.
    action("system.settings", "设置…", () => openCanvasSettings(type, "shortcuts", windowId)),
  ] };
}

export function canvasToolNodes(windowId: string, tools: CanvasTool[]): MenuEntry[] {
  const entries = tools.map(tool => {
    const node = new ActionNavNode(tool.name, () => runCanvasCommand(windowId, tool.command));
    return { id: tool.id, label: node.name, action: () => node.trigger() };
  });
  return entries.length ? [{ id: "system.tools", label: "工具", children: entries }] : [];
}
