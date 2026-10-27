import React, { useRef, useEffect, useState } from "react";
import type { Asset, ImageExportOptions } from "../../shared";
import type { Hierarchy } from "./hierarchy";
import { assetType } from "./assetTypes";
import "./export-selection.css";

type Props = {
  hierarchy: Hierarchy;
  assets: Asset[];
  busy: boolean;
  onClose: () => void;
  onExport: (selection: string[], name: string, zip: boolean, options?: ImageExportOptions) => Promise<void>;
};

function SelectionCheckbox({ checked, mixed, disabled, onChange }: {
  checked: boolean; mixed: boolean; disabled: boolean; onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" checked={checked} aria-checked={mixed ? "mixed" : checked} disabled={disabled} onChange={onChange} />;
}

export function ExportSelectionDialog({ hierarchy: h, assets, busy, onClose, onExport }: Props) {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const allKeys = [...h.folders.map(folder => `folder:${folder.id}`), ...h.assetIds.filter(id => byId.has(id))];
  const [selected, setSelected] = useState(() => new Set(allKeys));
  const [name, setName] = useState("AssetFlow-export");
  const [zip, setZip] = useState(true);
  const [imageOptions, setImageOptions] = useState<ImageExportOptions>({ format: "original", quality: 90, template: "{name}", background: "#ffffff" });
  const hasImages = h.assetIds.some(id => { const asset = byId.get(id); return asset && assetType(asset) === "image"; });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting;
  function folderKeys(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const children = [
      ...h.assetIds.filter(key => h.locations[key] === id && byId.has(key)),
      ...h.folders.filter(folder => folder.parent === id).flatMap(folder => folderKeys(folder.id, visited)),
    ];
    return children.length ? children : [`folder:${id}`];
  }
  function toggle(keys: string[]) {
    setSelected(old => {
      const next = new Set(old);
      const remove = keys.every(key => old.has(key));
      keys.forEach(key => remove ? next.delete(key) : next.add(key));
      return next;
    });
  }
  function content(parent: string | null, depth: number): React.ReactNode {
    return <>
      {h.folders.filter(folder => folder.parent === parent).map(folder => {
        const keys = folderKeys(folder.id);
        const checked = keys.every(key => selected.has(key));
        const mixed = !checked && keys.some(key => selected.has(key));
        return <React.Fragment key={folder.id}>
          <label className="export-selection-row" style={{ paddingLeft: 10 + depth * 18 }}>
            <SelectionCheckbox checked={checked} mixed={mixed} disabled={locked} onChange={() => toggle(keys)} />
            <span>▱ {folder.name}</span>
          </label>
          {content(folder.id, depth + 1)}
        </React.Fragment>;
      })}
      {h.assetIds.filter(id => (h.locations[id] ?? null) === parent && byId.has(id)).map(id => <label key={id} className="export-selection-row" style={{ paddingLeft: 10 + depth * 18 }}>
        <input type="checkbox" checked={selected.has(id)} disabled={locked} onChange={() => toggle([id])} />
        <span title={byId.get(id)!.name}>{byId.get(id)!.name}</span>
      </label>)}
    </>;
  }
  // Only emit complete folders: a partially selected folder would otherwise
  // re-include unchecked descendants when the exporter expands its selection.
  const selection = allKeys.filter(key => key.startsWith("folder:") ? folderKeys(key.slice(7)).every(child => selected.has(child)) : selected.has(key));
  return <div className="settings-backdrop" onPointerDown={() => { if (!locked) onClose(); }}>
    <form className="settings-dialog export-selection-dialog" role="dialog" aria-modal="true" aria-label="导出资源" onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !locked) { event.stopPropagation(); onClose(); } }} onSubmit={async event => {
      event.preventDefault();
      if (locked || !selection.length || !name.trim()) return;
      setSubmitting(true);
      setError("");
      try { await onExport(selection, name.trim(), zip, hasImages ? imageOptions : undefined); }
      catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
      finally { setSubmitting(false); }
    }}>
      <h3>导出资源</h3>
      <label className="export-name-field">导出名称<input autoFocus value={name} disabled={locked} onChange={event => setName(event.target.value)} /></label>
      <label className="export-name-field">输出形式<select aria-label="输出形式" value={zip ? "zip" : "folder"} disabled={locked} onChange={event => setZip(event.target.value === "zip")}><option value="zip">ZIP 压缩包</option><option value="folder">文件夹</option></select></label>
      {hasImages && <details className="export-image-settings">
        <summary>图片输出设置</summary>
        <div className="export-image-settings-grid">
          <label>输出格式<select aria-label="输出格式" disabled={locked} value={imageOptions.format} onChange={event => setImageOptions({ ...imageOptions, format: event.target.value })}>
            <option value="original">保持原格式</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option>
          </select></label>
          <label>质量<input aria-label="质量" type="number" min="1" max="100" disabled={locked} value={imageOptions.quality} onChange={event => setImageOptions({ ...imageOptions, quality: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} /></label>
          <label>文件命名模板<input aria-label="文件命名模板" disabled={locked} value={imageOptions.template} onChange={event => setImageOptions({ ...imageOptions, template: event.target.value })} /></label>
          <label>JPEG 背景<input aria-label="JPEG 背景" type="color" disabled={locked} value={imageOptions.background} onChange={event => setImageOptions({ ...imageOptions, background: event.target.value })} /></label>
        </div>
        <p className="hint">模板支持 {"{name}、{index}、{width}、{height}"}。</p>
      </details>}
      <div className="export-selection-toolbar">
        <span>选择要导出的文件和文件夹</span>
        <button type="button" disabled={locked} onClick={() => setSelected(new Set(allKeys))}>全选</button>
        <button type="button" disabled={locked} onClick={() => setSelected(new Set())}>清空</button>
      </div>
      <div className="export-selection-tree">{allKeys.length ? content(null, 0) : <p className="hint">暂无资源</p>}</div>
      {error && <p role="alert" className="export-selection-error">{error}</p>}
      <div className="export-selection-actions">
        <span className="hint">已选 {selection.filter(key => !key.startsWith("folder:")).length} 项资源</span>
        <button type="button" disabled={locked} onClick={onClose}>取消</button>
        <button type="submit" disabled={locked || !selection.length || !name.trim()}>{locked ? "正在导出…" : "导出"}</button>
      </div>
    </form>
  </div>;
}
