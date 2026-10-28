import React, { useEffect, useRef, useState } from "react";
import { CanvasFields } from "./CanvasFields";
import { configFor } from "./moduleRegistry";
import { orderTools, setCanvasPreferences, useCanvasPreferences } from "./canvasPreferences";
export function CanvasSettingsPage({ type, windowId, initialSection }: { type: string; windowId?: string; initialSection: string }) {
  const config = configFor(type);
  const preferences = useCanvasPreferences(type, windowId);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const update = (patch: Parameters<typeof setCanvasPreferences>[1]) => setCanvasPreferences(type, patch, windowId);
  useEffect(() => { if (initialSection === "shortcuts") root.current?.querySelector('[data-settings-section="shortcuts"]')?.scrollIntoView({ block: "nearest" }); }, [initialSection]);
  return <div ref={root} className="canvas-settings-page">
    <p className="settings-scope">{windowId ? "修改应用到当前画布" : "修改作为新画布的默认值"}</p>
    <section className="settings-section" data-settings-section="display"><h3>显示</h3><label><input type="checkbox" checked={preferences.visible} onChange={event => update({ visible: event.target.checked })} />显示画布编辑工具栏</label></section>
    <section className="settings-section" data-settings-section="shortcuts"><h3>编辑快捷入口</h3>
      {!config?.tools.length && <p className="hint">此类型尚未声明编辑工具。</p>}
      {orderTools(config?.tools ?? [], preferences.order).map((tool, index, tools) => <div className="shortcut-row" key={tool.id}>
        <label>{tool.kind !== "command" && <input type="checkbox" checked={!preferences.hidden.includes(tool.id) && (tool.toolbar !== false || preferences.shown.includes(tool.id))} onChange={event => update({
          hidden: event.target.checked ? preferences.hidden.filter(id => id !== tool.id) : [...preferences.hidden, tool.id],
          shown: event.target.checked ? [...new Set([...preferences.shown, tool.id])] : preferences.shown.filter(id => id !== tool.id)
        })} />}{tool.name}</label>
        <input aria-label={tool.name + "快捷键"} placeholder={tool.shortcut ?? "未设置"} value={preferences.shortcuts[tool.id] ?? tool.shortcut ?? ""} onChange={event => update({ shortcuts: { ...preferences.shortcuts, [tool.id]: event.target.value } })} onBlur={event => {
          const value = event.target.value;
          setError(value && (!/^(?:(?:Ctrl|Alt|Shift)\+)*[A-Za-z0-9]$/.test(value) || ["ctrl+s", "ctrl+z"].includes(value.toLowerCase()) || config?.tools.some(other => other.id !== tool.id && (preferences.shortcuts[other.id] ?? other.shortcut)?.toLowerCase() === value.toLowerCase())) ? "快捷键格式非法、冲突或由系统保留；该快捷键不会执行。" : "");
        }} />
        <button disabled={index === 0} aria-label={tool.name + "上移"} onClick={() => { const ids = tools.map(tool => tool.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; update({ order: ids }); }}>↑</button>
        <button disabled={index === tools.length - 1} aria-label={tool.name + "下移"} onClick={() => { const ids = tools.map(tool => tool.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; update({ order: ids }); }}>↓</button>
      </div>)}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
    <section className="settings-section" data-settings-section="settings"><h3>工具设置</h3>{config?.settings.length ? <CanvasFields windowId={windowId} fields={config.settings} values={preferences.settings} onChange={settings => update({ settings })} /> : <p className="hint">此类型没有额外设置。</p>}</section>
  </div>;
}
