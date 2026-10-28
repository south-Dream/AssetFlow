import React from "react";
import { InspectorLayout } from "./InspectorLayout";
import { CanvasConnections, type CanvasConnectionsProps } from "./CanvasConnections";
import { CanvasBaseProperties } from "./CanvasBaseProperties";

/** Types may append properties and supply operation content; common properties stay host-owned. */
export function CanvasInspector({ windowId, type, title, connections, children }: {
  windowId: string;
  type: string;
  title: string;
  connections?: CanvasConnectionsProps;
  children: React.ReactNode;
}) {
  const common: CanvasConnectionsProps = connections ?? {
    disabled: true, input: "", inputs: [], outputs: [], targets: [],
    onInput: () => {}, onOutputs: () => {}, onDrop: () => {},
  };
  return <InspectorLayout title={title} connections={<>
    <CanvasConnections {...common} />
    <CanvasBaseProperties key={`${windowId}:${type}`} type={type} windowId={windowId} />
  </>}>
    {children}
  </InspectorLayout>;
}
