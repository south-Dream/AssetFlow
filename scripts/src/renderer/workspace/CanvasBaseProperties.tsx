import React, { useState } from "react";
import { configFor, useModules } from "./moduleRegistry";
import {
  useCanvasPreferences,
  setCanvasPreferences,
} from "./canvasPreferences";
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
  const fields = configFor(type)?.inspector?.canvas ?? [];
  const preferences = useCanvasPreferences(type, windowId),
    [error, setError] = useState("");
  if (!fields.length) return null;
  return (
    <div className="canvas-base-properties">
      <CanvasFields
        windowId={windowId}
        fields={fields}
        values={{ ...fieldDefaults(fields), ...preferences.properties }}
        onChange={(values) => {
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
        }}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
