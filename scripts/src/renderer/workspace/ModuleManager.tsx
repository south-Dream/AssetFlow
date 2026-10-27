import React, { useEffect, useRef, useState } from "react";
import { imageConfig, setModuleRecords, useModules } from "./moduleRegistry";

export function ModuleManager({ onClose, usedTypes }: { onClose: () => void; usedTypes: string[] }) {
  const records = useModules();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("image");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const list = useRef<HTMLDivElement>(null);
  const rows = [
    { config: imageConfig, configPath: "系统内置", enabled: true, revision: 0, error: undefined as string | undefined },
    ...records
  ];
  const current = rows.find(row => row.config.id === selected) ?? rows[0];
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!(event.target as Element)?.closest?.(".module-context-menu")) setMenu(undefined); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  async function perform(fn: () => ReturnType<typeof window.assetFlow.canvasModules.list>, selectNew = false) {
    setBusy(true); setError(""); setMenu(undefined);
    try {
      const next = await fn();
      setModuleRecords(next);
      if (selectNew) setSelected(next.find(record => !records.some(old => old.config.id === record.config.id))?.config.id ?? selected);
      else if (!next.some(record => record.config.id === selected)) setSelected("image");
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  const record = records.find(record => record.config.id === menu?.id);
  const used = !!menu && usedTypes.includes(menu.id);
  const actions = record ? [
    { id: record.enabled ? "disable" : "enable", name: record.enabled ? "停用" : "启用" },
    { id: "reload", name: "重新加载" },
    { id: "uninstall", name: "移除关联" },
    { id: "uninstall-files", name: "卸载并移至回收站" }
  ] as const : [];
  const context = (id: string, x: number, y: number) => { setSelected(id); setMenu({ id, x: Math.max(8, Math.min(x, innerWidth - 220)), y: Math.max(8, Math.min(y, innerHeight - 220)) }); };
  return <div className="settings-backdrop" onPointerDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label="包管理器" className="settings-dialog module-manager" onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); menu ? setMenu(undefined) : onClose(); } }}>
      <header><strong>包管理器</strong><button aria-label="关闭包管理器" onClick={onClose}>×</button></header>
      <div className="module-list-heading"><span>Canvas 模块</span><span>版本</span><span>状态</span></div>
      <div ref={list} className="module-list" role="listbox" aria-label="已加载的 Canvas 模块" onKeyDown={event => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let index = rows.findIndex(row => row.config.id === current.config.id);
        index = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        setSelected(rows[index].config.id); list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();
      }}>
        {rows.map(row => {
          const builtin = row.config.id === "image", inUse = usedTypes.includes(row.config.id), active = row.config.id === current.config.id;
          return <button key={row.config.id} type="button" role="option" aria-selected={active} data-module-id={row.config.id} className={"module-row" + (active ? " selected" : "")} onClick={() => setSelected(row.config.id)} onContextMenu={event => { event.preventDefault(); context(row.config.id, event.clientX, event.clientY); }} onKeyDown={event => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); context(row.config.id, rect.left + 20, rect.bottom); }
          }}>
            <span className="module-name"><span>{row.config.name}</span>{builtin && <small className="module-badge">内置</small>}</span><span className="module-version">{row.config.version}</span><span className={"module-state" + (row.error ? " failed" : "")}>{builtin ? "只读" : row.error ? "加载失败" : inUse ? "使用中" : row.enabled ? "已启用" : "已停用"}</span>
          </button>;
        })}
      </div>
      <div className="module-selection-details"><strong>{current.config.name}</strong><p>{current.error ?? current.config.desc}</p><small title={current.configPath}>{current.configPath}</small></div>
      {error && <p role="alert" className="error module-error">{error}</p>}
      <footer className="module-manager-footer"><button type="button" className="module-add" aria-label="添加模块配置" title="添加 config.json" disabled={busy} onClick={() => void perform(() => window.assetFlow.canvasModules.install(), true)}>＋</button><span>{busy ? "正在处理…" : "添加 config.json · 右键列表项管理模块"}</span><small>{rows.length} 个模块</small></footer>
      {menu && <div className="module-context-menu" role="menu" aria-label="模块操作" style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()}>
        {!record ? <p>内置模块不可卸载</p> : <>{used && <p>请先关闭该类型画布</p>}{actions.map(action => <button key={action.id} type="button" role="menuitem" disabled={busy || used} onClick={() => void perform(() => window.assetFlow.canvasModules.change(action.id, record.config.id))}>{action.name}</button>)}</>}
      </div>}
    </section>
  </div>;
}
