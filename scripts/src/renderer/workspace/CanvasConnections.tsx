import React from "react";

type Option = { value: string; label: string };
export type CanvasConnectionsProps = {
  disabled?: boolean;
  input: string;
  inputs: Option[];
  outputs: string[];
  targets: Option[];
  onInput: (value: string) => void;
  onOutputs: (values: string[]) => void;
  onDrop: (event: React.DragEvent) => void;
};
export function CanvasConnections({
  disabled = false,
  input,
  inputs,
  outputs,
  targets,
  onInput,
  onOutputs,
  onDrop,
}: CanvasConnectionsProps) {
  return (
    <div className="canvas-connections">
      <label
        className="field"
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={onDrop}
      >
        <span>输入源</span>
        <select
          disabled={disabled}
          aria-label="输入源"
          value={input}
          onChange={(event) => onInput(event.target.value)}
        >
          <option value="">无（拖入资源或画布）</option>
          {inputs.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div
        className="field"
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.stopPropagation();
          const panel = event.dataTransfer.getData(
            "application/assetflow-dock"
          );
          if (panel.startsWith("canvas:"))
            onOutputs([...new Set([...outputs, panel.slice(7)])]);
        }}
      >
        <span>预览目标</span>
        <div className="connection-controls">
          {outputs.map((id) => (
            <div className="canvas-output" key={id}>
              <span>
                {targets.find((item) => item.value === id)?.label ?? id}
              </span>
              <button
                disabled={disabled}
                type="button"
                aria-label="断开输出关联"
                onClick={() =>
                  onOutputs(outputs.filter((value) => value !== id))
                }
              >
                ×
              </button>
            </div>
          ))}
          <select
            disabled={disabled}
            aria-label="添加输出画布"
            value=""
            onChange={(event) => onOutputs([...outputs, event.target.value])}
          >
            <option value="">
              {outputs.length ? "+ 关联画布（可拖入）" : "本画布（默认）"}
            </option>
            {targets
              .filter((item) => !outputs.includes(item.value))
              .map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </select>
        </div>
      </div>
    </div>
  );
}
