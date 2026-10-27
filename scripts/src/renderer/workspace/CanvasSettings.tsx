import React from "react";
import { configFor, useModules } from "./moduleRegistry";
import { ExtensionPanelView, useSystemExtensions } from "./SystemExtensions";
import { SettingsContainer, type SettingsPage } from "./SettingsContainer";
import { CanvasSettingsPage } from "./CanvasSettingsPage";

export function CanvasSettings({ initialType, windowId, initialSection, onClose, children, extensionPanel }: {
  initialType: string; windowId?: string; initialSection: string; onClose: () => void; children: React.ReactNode; extensionPanel?: string;
}) {
  const modules = useModules();
  const systemModules = useSystemExtensions();
  const types = [{ id: "image", name: "图片" }, ...modules.filter(record => record.enabled && !record.error).map(record => record.config)];
  if (initialType && !types.some(type => type.id === initialType)) types.push({ id: initialType, name: configFor(initialType)?.name ?? initialType });
  const pages: SettingsPage[] = [
    { id: "workspace", name: "工作区", content: children },
    ...types.map(type => ({ id: "canvas:" + type.id, name: type.name, content: <CanvasSettingsPage type={type.id} windowId={windowId} initialSection={type.id === initialType ? initialSection : "display"} /> }))
  ];
  for (const record of systemModules) if (!record.error && record.config) for (const page of record.config.settingsPages) if (!pages.some(item => item.id === "extension:" + page.panel)) pages.push({
    id: "extension:" + page.panel, name: record.config.name === page.name ? page.name : record.config.name + " · " + page.name,
    content: <ExtensionPanelView panelId={page.panel} host="settings" />
  });
  if (extensionPanel && !pages.some(page => page.id === "extension:" + extensionPanel)) pages.push({
    id: "extension:" + extensionPanel,
    name: systemModules.flatMap(record => record.config?.panels ?? []).find(panel => panel.id === extensionPanel)?.name ?? "扩展设置",
    content: <ExtensionPanelView panelId={extensionPanel} host="settings" />
  });
  return <SettingsContainer pages={pages} initialPage={extensionPanel ? "extension:" + extensionPanel : initialType ? "canvas:" + initialType : "workspace"} title={windowId ? "当前画布设置" : "设置"} onClose={onClose} />;
}
