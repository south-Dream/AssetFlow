import React from "react";
import { PanelToolbar } from "./PanelToolbar";
import { CanvasToolbox } from "./CanvasToolbox";

/** The host owns every canvas's navigation and left operation shortcuts. */
export function CanvasFrame({ windowId, type, isActive, onTypeChange, onDragOver, onDrop, children }: {
  windowId: string;
  type: string;
  isActive?: boolean;
  onTypeChange: (type: string) => void;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return <div className="generic-panel" onDragOver={onDragOver} onDrop={onDrop}>
    <PanelToolbar windowId={windowId} type={type} isActive={isActive} onTypeChange={onTypeChange} />
    <div className="canvas-surface">
      <CanvasToolbox key={type} windowId={windowId} type={type} />
      {children}
    </div>
  </div>;
}
