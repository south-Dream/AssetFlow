import React, { useState } from "react";
import type { DockNode, DockPanelId } from "./model";

type Zone = "center" | "left" | "right" | "top" | "bottom";
type Props = {
  node: DockNode;
  activePanel: DockPanelId;
  setActivePanel: (panel: DockPanelId, groupId?: string) => void;
  renderPanel: (panel: DockPanelId) => React.ReactNode;
  onMove: (panel: DockPanelId, target: string, zone: Zone) => void;
  onClose: (panel: DockPanelId) => void;
  onContextMenu: (panel: DockPanelId, x: number, y: number) => void;
  panelTitle: (panel: DockPanelId) => string;
  onResize: (splitId: string, ratio: number) => void;
};

export function DockLayout(props: Props) {
  return <div className="dock-tree">{renderNode(props.node, props)}</div>;
}

function renderNode(node: DockNode, props: Props): React.ReactNode {
  if (node.kind === "split")
    return <DockSplit key={node.id} node={node} props={props} />;
  return (
    <DockTabs
      key={node.id}
      node={node}
      activePanel={props.activePanel}
      setActivePanel={props.setActivePanel}
      renderPanel={props.renderPanel}
      onMove={props.onMove}
      onClose={props.onClose}
      onContextMenu={props.onContextMenu}
      panelTitle={props.panelTitle}
      onResize={props.onResize}
    />
  );
}

function DockSplit({
  node,
  props,
}: {
  node: Extract<DockNode, { kind: "split" }>;
  props: Props;
}) {
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = event.currentTarget.parentElement!;
    const rect = container.getBoundingClientRect();
    const length = node.axis === "horizontal" ? rect.width : rect.height;
    const origin = node.axis === "horizontal" ? event.clientX : event.clientY;
    const initialRatio = node.ratio;
    const move = (next: PointerEvent) => {
      const position = node.axis === "horizontal" ? next.clientX : next.clientY;
      props.onResize(node.id, initialRatio + (position - origin) / length);
    };
    const done = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  }
  return (
    <div
      className={`dock-split dock-split-${node.axis}`}
      style={{ "--split-ratio": node.ratio } as React.CSSProperties}
    >
      <div className="dock-split-child">{renderNode(node.first, props)}</div>
      <div
        className="dock-resize-handle"
        role="separator"
        aria-orientation={
          node.axis === "horizontal" ? "vertical" : "horizontal"
        }
        onPointerDown={startResize}
      />
      <div className="dock-split-child">{renderNode(node.second, props)}</div>
    </div>
  );
}

function DockTabs({
  node,
  activePanel,
  setActivePanel,
  renderPanel,
  onMove,
  onClose,
  onContextMenu,
  panelTitle,
}: Omit<Props, "node"> & { node: Extract<DockNode, { kind: "tabs" }> }) {
  const [zone, setZone] = useState<Zone | null>(null);
  return (
    <section
      className="dock-group"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/assetflow-dock")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          setZone(
            x < 0.24
              ? "left"
              : x > 0.76
                ? "right"
                : y < 0.24
                  ? "top"
                  : y > 0.76
                    ? "bottom"
                    : "center",
          );
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setZone(null);
      }}
      onDrop={(event) => {
        const panel = event.dataTransfer.getData(
          "application/assetflow-dock",
        ) as DockPanelId;
        if (!panel) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const targetZone =
          x < 0.24
            ? "left"
            : x > 0.76
              ? "right"
              : y < 0.24
                ? "top"
                : y > 0.76
                  ? "bottom"
                  : "center";
        onMove(panel, node.id, targetZone);
        setZone(null);
      }}
    >
      <div className="dock-tab-strip">
        {node.panels.map((panel) => (
          <button
            key={panel}
            draggable
            onDragStart={(event) => {
              setActivePanel(panel, node.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/assetflow-dock", panel);
            }}
            onClick={() => setActivePanel(panel, node.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(panel, event.clientX, event.clientY);
            }}
            className={`${panel === node.active ? "active" : ""} ${panel === activePanel ? "focused" : ""}`}
          >
            <span>{panelTitle(panel)}</span>
            {(panel.startsWith("canvas:") || panel.startsWith("extension:")) && (
              <i
                role="button"
                aria-label={panel.startsWith("extension:") ? "关闭扩展面板" : "移除画布"}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(panel);
                }}
              >
                ×
              </i>
            )}
          </button>
        ))}
      </div>
      <div className="dock-group-content">
        {node.panels.map((panel) => (
          <div
            key={panel}
            className="dock-panel-view"
            style={{ display: panel === node.active ? "flex" : "none" }}
            onPointerDown={() => setActivePanel(panel, node.id)}
          >
            {renderPanel(panel)}
          </div>
        ))}
      </div>
      {zone && <div className={`dock-zone dock-zone-${zone}`} />}
    </section>
  );
}
