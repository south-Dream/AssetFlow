import React, { useMemo } from "react";
import { DrawerField } from "./DrawerField";
import type { CanvasValues, ConfigField } from "../../extensions/canvas/contracts";

/** Reserved transport for Canvas/Tool draw(), not a third kind of node. */
export function NodeInspectorDraw({ windowId, id, values, onChange }: {
  windowId: string; id: string; values: CanvasValues; onChange: (values: CanvasValues) => void;
}) {
  const field = useMemo<ConfigField>(() => ({ id, name: "", type: "text", default: "", renderer: id }), [id]);
  return <DrawerField windowId={windowId} field={field} values={values} onChange={next => {
    const value = JSON.parse(String(next[id]));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid Inspector parameters");
    onChange(value);
  }} />;
}
