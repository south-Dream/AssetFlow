import React, { useState } from "react";
import type { Step } from "../../shared";
import { imageOutputSteps } from "./imageOutput";
import { savePanelResult } from "./savePanelResult";
export function ImageOutputDialog({
  assetId,
  steps,
  onClose,
  onDone,
}: {
  assetId: string;
  steps: Step[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState({
    format: "png",
    quality: 90,
    template: "{name}",
    background: "#ffffff",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="settings-backdrop">
      <form
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="保存导出图片"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void savePanelResult(
            window.assetFlow,
            assetId,
            imageOutputSteps(steps, options)
          )
            .then((saved) => {
              if (saved) onDone();
            })
            .catch((error) => setError(String(error)))
            .finally(() => setBusy(false));
        }}
      >
        <header>
          <strong>保存 / 导出图片</strong>
        </header>
        <label>
          输出格式
          <select
            aria-label="输出格式"
            value={options.format}
            disabled={busy}
            onChange={(e) => setOptions({ ...options, format: e.target.value })}
          >
            {["png", "jpeg", "webp"].map((format) => (
              <option key={format}>{format}</option>
            ))}
          </select>
        </label>
        <label>
          质量
          <input
            type="number"
            min="1"
            max="100"
            value={options.quality}
            disabled={busy}
            onChange={(e) =>
              setOptions({ ...options, quality: Number(e.target.value) })
            }
          />
        </label>
        <label>
          文件命名模板
          <input
            aria-label="文件命名模板"
            value={options.template}
            disabled={busy}
            onChange={(e) =>
              setOptions({ ...options, template: e.target.value })
            }
          />
        </label>
        <label>
          JPEG 背景
          <input
            type="color"
            value={options.background}
            disabled={busy}
            onChange={(e) =>
              setOptions({ ...options, background: e.target.value })
            }
          />
        </label>
        <p>
          模板支持 {"{name}、{index}、{width}、{height}"}。导出不会覆盖源文件。
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "正在导出…" : "选择目录并导出"}
        </button>
      </form>
    </div>
  );
}
