import React, { useState } from "react";
import { configFor, useModules } from "./moduleRegistry";
import {
  useCanvasPreferences,
  setCanvasPreferences,
} from "./canvasPreferences";
import { NodeInspectorDraw } from "./NodeInspectorDraw";
import { CanvasFields } from "./CanvasFields";
import { fieldDefaults, validateValues } from "../../extensions/canvas/config";
export function CanvasBaseProperties({
  type,
  windowId,
}: {
  type: string;
  windowId: string;
}) {
  useModules();
  const config = configFor(type);
  const fields = config?.inspector?.canvas ?? [];
  const preferences = useCanvasPreferences(type, windowId),
    [error, setError] = useState("");
  if (!fields.length && !config?.bindings) return null;
  const change = (values: import("../../extensions/canvas/contracts").CanvasValues) => {
          try {
            const properties = validateValues(fields, values);
            setCanvasPreferences(type, { properties }, windowId);
            window.dispatchEvent(
              new CustomEvent("assetflow:canvas-properties-changed", {
                detail: { windowId },
              })
            );
            setError("");
          } catch (error) {
            setError(String(error));
          }
        };
  return (
    <div className="canvas-base-properties">
      {config?.bindings ? <NodeInspectorDraw windowId={windowId} id={`${config.id}.__canvas`} values={{ ...fieldDefaults(fields), ...preferences.properties }} onChange={change} /> : <CanvasFields windowId={windowId} fields={fields} values={{ ...fieldDefaults(fields), ...preferences.properties }} onChange={change} />}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
