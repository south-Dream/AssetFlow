import React, { useState } from "react";
import type { Asset } from "../../shared";
import type { Hierarchy } from "./hierarchy";
import { assetType, type AssetIcons } from "./assetTypes";
import { filterHierarchy } from "./hierarchyFilter";
import "./hierarchy-filters.css";
type Props = {
  hierarchy: Hierarchy;
  assets: Asset[];
  selection: string[];
  onSelection: (ids: string[]) => void;
  icons: AssetIcons;
  onChange: (h: Hierarchy) => void;
  onDropFiles: (files: File[], folder: string | null) => void;
  onOpen?: (asset: Asset) => void;
};
export function HierarchyPanel({
  hierarchy: h,
  assets,
  selection,
  onSelection,
  icons,
  onChange,
  onDropFiles,
  onOpen,
}: Props) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    parent: string | null;
  } | null>(null);
  const [name, setName] = useState("新建文件夹");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filteredCollapsed, setFilteredCollapsed] = useState<string[]>([]);
  const filtering = Boolean(search.trim());
  const visible = filterHierarchy(h, assets, search, []);
  const activeCollapsed = filtering ? filteredCollapsed : collapsed;
  const updateCollapsed = filtering ? setFilteredCollapsed : setCollapsed;
  function select(id: string, event: React.MouseEvent) {
    onSelection(
      event.ctrlKey || event.metaKey
        ? selection.includes(id)
          ? selection.filter((s) => s !== id)
          : [...selection, id]
        : [id]
    );
  }
  function drop(event: React.DragEvent, folder: string | null) {
    if (event.dataTransfer.types.includes("application/assetflow-dock")) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("application/assetflow-assets");
    const ids: string[] = raw
      ? JSON.parse(raw)
      : [event.dataTransfer.getData("application/assetflow-asset")].filter(
          Boolean
        );
    if (ids.length)
      onChange({
        ...h,
        assetIds: [...new Set([...h.assetIds, ...ids])],
        locations: {
          ...h.locations,
          ...Object.fromEntries(ids.map((id) => [id, folder])),
        },
      });
    else if (event.dataTransfer.files.length)
      onDropFiles(Array.from(event.dataTransfer.files), folder);
  }
  function context(event: React.MouseEvent, parent: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.min(event.clientX, innerWidth - 230),
      y: Math.min(event.clientY, innerHeight - 140),
      parent,
    });
  }
  function content(parent: string | null, depth: number): React.ReactNode {
    return (
      <>
        {visible.folders
          .filter((f) => f.parent === parent)
          .map((folder) => (
            <React.Fragment key={folder.id}>
              <div
                className={`folder-row ${
                  selection.includes(`folder:${folder.id}`) ? "selected" : ""
                }`}
                style={{ paddingLeft: 10 + depth * 16 }}
                onContextMenu={(e) => context(e, folder.id)}
                onDragOver={(e) => {
                  if (
                    !e.dataTransfer.types.includes("application/assetflow-dock")
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDrop={(e) => drop(e, folder.id)}
                onClick={(e) => select(`folder:${folder.id}`, e)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateCollapsed((old) =>
                      old.includes(folder.id)
                        ? old.filter((id) => id !== folder.id)
                        : [...old, folder.id]
                    );
                  }}
                >
                  {activeCollapsed.includes(folder.id) ? "▸" : "▾"}
                </button>
                <span>▱ {folder.name}</span>
              </div>
              {!activeCollapsed.includes(folder.id) && content(folder.id, depth + 1)}
            </React.Fragment>
          ))}
        {visible.assetIds
          .filter((id) => (h.locations[id] ?? null) === parent)
          .map((id) => {
            const a = assets.find((a) => a.id === id);
            return a ? (
              <div
                key={id}
                className={`asset ${selection.includes(id) ? "selected" : ""}`}
                style={{ marginLeft: 8 + depth * 16 }}
                draggable
                onDoubleClick={() => onOpen?.(a)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copyMove";
                  event.dataTransfer.setData("application/assetflow-asset", id);
                  event.dataTransfer.setData(
                    "application/assetflow-assets",
                    JSON.stringify(
                      selection.includes(id)
                        ? selection.filter((s) => !s.startsWith("folder:"))
                        : [id]
                    )
                  );
                }}
                onClick={(event) => {
                  select(id, event);
                }}
              >
                <span className="asset-type-icon" aria-hidden="true">
                  {icons[assetType(a)] ?? "◇"}
                </span>
                <div className="asset-info">
                  <strong title={a.path}>{a.name}</strong>
                </div>
                <button
                  className="asset-remove"
                  title="移除引用"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({
                      ...h,
                      assetIds: h.assetIds.filter((key) => key !== id),
                    });
                  }}
                >
                  ×
                </button>
              </div>
            ) : null;
          })}
      </>
    );
  }
  return (
    <aside className="assets hierarchy-tree">
      <div className="panel-nav hierarchy-filter-bar">
        <span className="hierarchy-resource-count" title="Ctrl 多选">{h.assetIds.length} 项资源</span>
        <input
          className="hierarchy-search"
          type="search"
          aria-label="搜索资源名称或层级路径"
          placeholder="搜索名称、路径或 *.jpg"
          title="支持关键字、*.jpg、xxx.* 和路径通配符"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setFilteredCollapsed([]); }}
        />

      </div>
      <div
        className={`asset-list${!visible.assetIds.length && !visible.folders.length ? " hierarchy-empty-list" : ""}`}
        onContextMenu={(e) => context(e, null)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("application/assetflow-dock"))
            e.preventDefault();
        }}
        onDrop={(e) => drop(e, null)}
      >
        {content(null, 0)}
        {!visible.assetIds.length && !visible.folders.length && (
          <p className="hint hierarchy-empty-message">{filtering ? "没有匹配资源" : "拖入文件或文件夹以导入"}</p>
        )}
      </div>
      {menu && (
        <div className="settings-backdrop" onPointerDown={() => setMenu(null)}>
          <form
            className="workspace-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || /[\\/:*?"<>|]/.test(name)) return;
              onChange({
                ...h,
                folders: [
                  ...h.folders,
                  {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    parent: menu.parent,
                  },
                ],
              });
              setMenu(null);
            }}
          >
            <input
              autoFocus
              aria-label="文件夹名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">创建文件夹</button>
            <button type="button" onClick={() => setMenu(null)}>
              取消
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
