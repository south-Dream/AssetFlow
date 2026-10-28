import { canvasEditNodes, canvasToolNodes } from "./canvasNavigation";
import { CanvasMgr } from "./managers";
import React, { useEffect, useSyncExternalStore } from "react";
import { getPanelTypes, subscribePanelTypes } from "./panelTypes";
import { configFor, useModules } from "./moduleRegistry";
import { NavigationContainer } from "./NavigationContainer";
import { CanvasNavigationContainer } from "../../extensions/navigation";
import {
  openCanvasSettings,
  runCanvasCommand,
  setCanvasPreferences,
  useCanvasPreferences,
} from "./canvasPreferences";
import { extendMenuEntries } from "./SystemExtensions";

type Props = {
  windowId: string;
  type: string;
  onTypeChange: (type: string) => void;
  isActive?: boolean;
};
export function PanelToolbar({
  windowId,
  type,
  onTypeChange,
  isActive = false,
}: Props) {
  useModules();
  const config = configFor(type);
  const preferences = useCanvasPreferences(type, windowId);
  useEffect(() => {
    if (!isActive) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,[contenteditable=true]"
          )) ||
        document.querySelector(".settings-backdrop")
      )
        return;
      const key = [
        event.ctrlKey || event.metaKey ? "Ctrl" : "",
        event.altKey ? "Alt" : "",
        event.shiftKey ? "Shift" : "",
        event.key.toUpperCase(),
      ]
        .filter(Boolean)
        .join("+");
      if (key === "Ctrl+S") return;
      if (key === "Ctrl+Z") { event.preventDefault(); void CanvasMgr.undo(windowId); return; }
      const matches =
        config?.tools.filter(
          (tool) =>
            (preferences.shortcuts[tool.id] ?? tool.shortcut)?.toUpperCase() ===
            key.toUpperCase()
        ) ?? [];
      if (matches.length === 1) {
        event.preventDefault();
        runCanvasCommand(windowId, matches[0].command);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [isActive, config, preferences, windowId]);
  const types = useSyncExternalStore(
    subscribePanelTypes,
    getPanelTypes,
    getPanelTypes
  );
  const navigation = extendMenuEntries([
    canvasEditNodes(windowId, type, {
      id: "system.type", label: "类型",
      children: types.map(entry => ({ id: `system.type.${entry.id}`, label: entry.label,
        checked: entry.id === type, action: () => onTypeChange(entry.id) })),
    }),
    ...canvasToolNodes(windowId, config?.tools ?? []),
  ], (config?.menus ?? []).map(menu => ({ ...menu, parent: menu.parent ?? "system.root" })), command => runCanvasCommand(windowId, command));
  return (
    <div className="panel-nav panel-toolbar" aria-label="面板工具栏">
      <NavigationContainer entries={navigation} container={new CanvasNavigationContainer(`canvas.top.${windowId}`)} />
    </div>
  );
}
