import React, { useEffect, useMemo, useState } from "react";
import type { Asset, Step } from "../shared";
import { VisualEditor } from "./VisualEditor";
import { finishImageEdit } from "./workspace/imageEditing";
const NO_STEPS: Step[] = [];

export type ImageWorkspaceState = {
  recursive: boolean;
  running: boolean;
  outputDirectory: string;
  preserve: boolean;
  zip: boolean;
};
export type EditorViewportState = {
  scale: number;
  panX: number;
  panY: number;
  locked: boolean;
};
export type ImageDocument = {
  steps: Step[];
  activeStepId: string;
  editing: {
    draft: Step;
    prefix: Step[];
    fresh: boolean;
    initialParams?: Record<string, unknown>;
    dirty?: boolean;
    inputSize?: { width: number; height: number };
    validation?: { key: string; status: "pending" | "valid" | "invalid"; error?: string };
  } | null;
  viewport: EditorViewportState;
};
type Props = {
  displayInput?: boolean;
  inheritedSteps?: Step[];
  windowId: string;
  isActive: boolean;
  assets: Asset[];
  setAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  selectedAssetId: string;
  document: ImageDocument;
  setDocument: React.Dispatch<React.SetStateAction<ImageDocument>>;
  workspaceState: ImageWorkspaceState;
  setWorkspaceState: React.Dispatch<React.SetStateAction<ImageWorkspaceState>>;
};
export function ImageWorkspace({
  displayInput = false,
  inheritedSteps = NO_STEPS,
  windowId,
  isActive,
  assets,
  selectedAssetId,
  document,
  setDocument,
}: Props) {
  const [preview, setPreview] = useState<
    | (Awaited<ReturnType<typeof window.assetFlow.preview>> & {
        assetId: string;
      })
    | null
  >(null);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const { editing } = document;
  const visualEditing =
    !!editing && ["crop", "resize"].includes(editing.draft.processor);
  const steps = useMemo(
    () =>
      displayInput
        ? inheritedSteps
        : [
            ...inheritedSteps,
            ...document.steps,
            ...(!visualEditing && editing ? [editing.draft] : []),
          ],
    [inheritedSteps, document.steps, displayInput, editing, visualEditing]
  );
  const asset = assets.find((a) => a.id === selectedAssetId);
  const index = asset ? assets.indexOf(asset) : 0;
  useEffect(() => {
    let live = true;
    setError("");
    if (!asset || asset.error || visualEditing) {
      setCalculating(false);
      if (asset?.error) setError(asset.error);
      return;
    }
    setCalculating(true);
    const draftId = editing?.draft.id;
    const draftKey = editing ? JSON.stringify(editing.draft) : "";
    const validation = (status: "pending" | "valid" | "invalid", error?: string) => {
      if (!draftId || visualEditing) return;
      setDocument(old => old.editing?.draft.id === draftId && JSON.stringify(old.editing.draft) === draftKey ? { ...old, editing: { ...old.editing, validation: { key: draftKey, status, error } } } : old);
    };
    validation("pending");
    const timer = window.setTimeout(() => {
      void window.assetFlow
        .preview(asset.id, steps, index, "processed", windowId)
        .then((result) => {
          if (live) {
            setPreview({ ...result, assetId: asset.id });
            setCalculating(false);
            validation("valid");
          }
        })
        .catch((cause) => {
          if (live) {
            setError(String(cause));
            setCalculating(false);
            validation("invalid", String(cause));
          }
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [asset, index, JSON.stringify(steps), visualEditing, windowId]);
  function finishEdit(apply: boolean) {
    if (!editing) return;
    setDocument((old) => finishImageEdit(old, apply));
  }
  return (
    <div
      className="image-window-content"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/assetflow-dock"))
          event.preventDefault();
      }}
    >
      <main className="editor-canvas">
        {visualEditing && editing && asset ? (
          <VisualEditor
            windowId={windowId}
            key={asset.id + editing.draft.id}
            asset={asset}
            index={index}
            prefix={[...inheritedSteps, ...editing.prefix]}
            draft={editing.draft}
            fresh={editing.fresh}
            onInputSize={(size) =>
              setDocument((old) => ({
                ...old,
                editing: old.editing
                  ? { ...old.editing, inputSize: size }
                  : null,
              }))
            }
            viewport={document.viewport}
            setViewport={(update) =>
              setDocument((old) => ({
                ...old,
                viewport:
                  typeof update === "function" ? update(old.viewport) : update,
              }))
            }
            onParams={(params) =>
              setDocument((old) => ({
                ...old,
                editing: old.editing
                  ? { ...old.editing, initialParams: old.editing.initialParams ?? structuredClone(params), draft: { ...old.editing.draft, params } }
                  : null,
              }))
            }
            onApply={() => finishEdit(true)}
            onCancel={() => finishEdit(false)}
          />
        ) : (
          <div className="preview-area">
            {preview && preview.assetId === asset?.id ? (
              <img
                className="preview-image"
                src={preview.url}
                alt={asset?.name ?? "图片"}
              />
            ) : (
              <p className="hint">
                {error || (asset ? "正在生成预览…" : "拖入匹配类型的资源")}
              </p>
            )}
          </div>
        )}
        {calculating && preview?.assetId === asset?.id && (
          <div className="preview-status">正在更新编辑预览…</div>
        )}
        {error && preview?.assetId === asset?.id && (
          <div className="error" role="alert">
            当前计算失败，画面保留上次成功预览：{error}
          </div>
        )}
        {preview?.warnings.length ? (
          <div className="warning">{preview.warnings.join("；")}</div>
        ) : null}
      </main>
    </div>
  );
}
