import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { configFor, toolIconFor, useModules } from "./moduleRegistry";
import {
  orderTools,
  runCanvasCommand,
  useCanvasPreferences,
} from "./canvasPreferences";

function ToolIcon({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img src={src} alt="" draggable={false} onError={() => setFailed(true)} />
  ) : (
    <span aria-hidden="true">{name.slice(0, 1)}</span>
  );
}
export function CanvasToolbox({
  windowId,
  type,
}: {
  windowId: string;
  type: string;
}) {
  useModules();
  const config = configFor(type);
  const preferences = useCanvasPreferences(type, windowId);
  const [selected, setSelected] = useState("");
  const [tip, setTip] = useState<{
    name: string;
    desc: string;
    left: number;
    top: number;
  }>();
  useEffect(() => {
    const activate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.windowId === windowId) setSelected(detail.command);
    };
    window.addEventListener("assetflow:command", activate);
    return () => window.removeEventListener("assetflow:command", activate);
  }, [windowId]);
  if (!preferences.visible || !config?.tools.length) return null;
  const tools = orderTools(config.tools, preferences.order).filter(
    (tool) =>
      !preferences.hidden.includes(tool.id) &&
      (tool.toolbar !== false || preferences.shown.includes(tool.id))
  );
  if (!tools.length) return null;
  return (
    <aside
      className="canvas-toolbox canvas-tool-shortcuts"
      aria-label="画布编辑工具"
      role="toolbar"
      aria-orientation="vertical"
    >
      {tools.map((tool) => {
        const shortcut = preferences.shortcuts[tool.id] ?? tool.shortcut;
        return (
          <button
            key={tool.id}
            type="button"
            aria-label={tool.name}
            aria-pressed={selected === tool.command}
            data-command={tool.command}
            onClick={() => runCanvasCommand(windowId, tool.command)}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setTip({
                name: `${tool.name}${shortcut ? ` (${shortcut})` : ""}`,
                desc: tool.desc ?? tool.name,
                left: Math.max(4, Math.min(rect.right + 8, innerWidth - 260)),
                top: Math.max(4, Math.min(rect.top, innerHeight - 110)),
              });
            }}
            onMouseLeave={() => setTip(undefined)}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setTip({
                name: `${tool.name}${shortcut ? ` (${shortcut})` : ""}`,
                desc: tool.desc ?? tool.name,
                left: Math.max(4, Math.min(rect.right + 8, innerWidth - 260)),
                top: Math.max(4, Math.min(rect.top, innerHeight - 110)),
              });
            }}
            onBlur={() => setTip(undefined)}
          >
            <ToolIcon src={toolIconFor(type, tool.icon)} name={tool.name} />
          </button>
        );
      })}
      {tip &&
        createPortal(
          <div
            className="canvas-tool-tip"
            role="tooltip"
            style={{ left: tip.left, top: tip.top }}
          >
            <strong>{tip.name}</strong>
            <p>{tip.desc}</p>
          </div>,
          document.body
        )}
    </aside>
  );
}
