import React, { useEffect, useSyncExternalStore } from "react";
import { getPanelTypes, subscribePanelTypes } from "./panelTypes";
import { configFor, useModules } from "./moduleRegistry";
import type { NavigationRegionRenderer } from "./MainMenu";
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
  commonTools?: React.ReactNode;
  isActive?: boolean;
  renderNavigationRegion?: NavigationRegionRenderer;
};
export function PanelToolbar({
  windowId,
  type,
  onTypeChange,
  commonTools,
  isActive = false,
  renderNavigationRegion,
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
  const Tools = types.find((entry) => entry.id === type)?.tools;
  const navigation = extendMenuEntries([
            {
              id: "system.edit",
              label: "编辑",
              children: [
                {
                  id: "system.type",
                  label: "类型",
                  children: types.map((entry) => ({
                    id: `system.type.${entry.id}`,
                    label: entry.label,
                    checked: entry.id === type,
                    action: () => onTypeChange(entry.id),
                  })),
                },
                {
                  id: "system.display",
                  label: "显示编辑工具栏",
                  checked: preferences.visible,
                      action: () =>
                        setCanvasPreferences(
                          type,
                          {
                            visible: !preferences.visible,
                          },
                          windowId
                        ),
                },
                {
                  id: "system.settings",
                  label: "设置…",
                  action: () => openCanvasSettings(type, "display", windowId),
                },
                ...(config?.tools.length
                  ? [
                      {
                        id: "system.tools",
                        label: "工具",
                        children: config.tools.map((tool) => ({
                          id: tool.id,
                          label: tool.name,
                          action: () =>
                            runCanvasCommand(windowId, tool.command),
                        })),
                      },
                    ]
                  : []),
              ],
            },
          ], (config?.menus ?? []).map(menu => ({ ...menu, parent: menu.parent ?? "system.root" })), command => runCanvasCommand(windowId, command));
  return (
    <div className="panel-nav panel-toolbar" aria-label="面板工具栏">
      <NavigationContainer entries={navigation} container={new CanvasNavigationContainer(`canvas.top.${windowId}`)} layout={config?.navigation} renderRegion={renderNavigationRegion ?? ((region, items, draw) => <>{draw(items)}{region === "left" && commonTools}{region === "right" && Tools && <Tools key={`${windowId}:${type}`} windowId={windowId} />}</>)} />
    </div>
  );
}
