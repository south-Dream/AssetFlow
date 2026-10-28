import React from "react";
import type { ConfigField, CanvasValues } from "../../extensions/canvas/contracts";
import { DrawerField } from "./DrawerField";
import { runCanvasCommand } from "./canvasPreferences";
export function CanvasFields({
  fields,
  values,
  onChange,
  windowId,
  onFieldChange,
}: {
  fields: ConfigField[];
  values: CanvasValues;
  onChange: (values: CanvasValues) => void;
  windowId?: string;
  onFieldChange?: (id: string, value: string | number | boolean) => void;
}) {
  const update = (id: string, value: string | number | boolean) => onFieldChange ? onFieldChange(id, value) : onChange({ ...values, [id]: value });
  return (
    <>
      {[...fields]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((field) => (
          <div className="field" key={field.id}>
            <span>{field.name}</span>
            {field.renderer && windowId ? (
              <DrawerField
                windowId={windowId}
                field={field}
                values={values}
                onChange={onChange}
              />
            ) : field.control === "button" ? (
              <button
                type="button"
                disabled={!windowId}
                onClick={() => {
                  if (windowId && field.command)
                    runCanvasCommand(windowId, field.command);
                }}
              >
                {field.name}
              </button>
            ) : field.type === "select" ? (
              <select
                aria-label={field.name}
                value={String(values[field.id] ?? field.default)}
                onChange={(e) =>
                  update(field.id, e.target.value)
                }
              >
                {field.options?.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={field.name}
                type={
                  field.control === "slider"
                    ? "range"
                    : field.type === "boolean"
                    ? "checkbox"
                    : field.type === "number"
                    ? "number"
                    : "text"
                }
                min={field.min}
                step={field.control === "slider" ? "any" : undefined}
                max={field.max}
                checked={
                  field.type === "boolean"
                    ? Boolean(values[field.id] ?? field.default)
                    : undefined
                }
                value={
                  field.type === "boolean"
                    ? undefined
                    : String(values[field.id] ?? field.default)
                }
                onChange={(e) =>
                  update(field.id,
                      field.type === "boolean"
                        ? e.target.checked
                        : field.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  )
                }
              />
            )}
          </div>
        ))}
    </>
  );
}
