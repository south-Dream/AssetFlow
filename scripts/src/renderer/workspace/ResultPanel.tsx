import React, { useEffect, useState } from "react";
import type { Asset, Step } from "../../shared";
export function ResultPanel({
  asset,
  steps,
  source,
  windowId,
}: {
  asset?: Asset;
  steps: Step[];
  source: string;
  windowId: string;
}) {
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setError("");
    if (asset && /^(png|jpeg|jpg|webp)$/i.test(asset.format))
      void window.assetFlow
        .preview(asset.id, steps, 0, "processed", windowId)
        .then((r) => {
          if (live) setPreview({ id: asset.id, url: r.url });
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [asset, steps, windowId]);
  return (
    <div className="result-panel">
      <div className="panel-nav">只读 · {source}</div>
      <div className="preview-area">
        {preview && preview.id === asset?.id ? (
          <img className="preview-image" src={preview.url} alt="应用后的结果" />
        ) : (
          <p className="hint">
            {error || "选择 img 编辑面板中的资源以预览结果"}
          </p>
        )}
      </div>
    </div>
  );
}
