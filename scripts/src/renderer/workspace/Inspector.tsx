import React, { useEffect, useState } from "react";
import type { Definition, Step, PanelSnapshot } from "../../shared";
import type { ImageDocument } from "../ImageWorkspace";
import { InspectorLayout } from "./InspectorLayout";
import { finishImageEdit, imageDraftError } from "./imageEditing";

export function Inspector({
  saved,
  showHistory,
  onShowHistory,
  title,
  document,
  setDocument: commitDocument,
  connections,
}: {
  saved?: PanelSnapshot;
  showHistory: boolean;
  onShowHistory: () => void;
  title: string;
  document?: ImageDocument;
  setDocument: React.Dispatch<React.SetStateAction<ImageDocument>>;
  connections?: React.ReactNode;
}) {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  useEffect(() => {
    void window.assetFlow.definitions().then(setDefinitions);
  }, []);
  const current = document?.editing?.draft;
  const definition = definitions.find((item) => item.id === current?.processor);
  const draftError = document ? imageDraftError(document) : "";
  const setDocument: React.Dispatch<React.SetStateAction<ImageDocument>> = (
    update
  ) =>
    commitDocument((old) => {
      if (!old.editing)
        return typeof update === "function" ? update(old) : update;
      const draft = old.editing.draft;
      const steps = old.editing.fresh
        ? [...old.steps, draft]
        : old.steps.map((step) => (step.id === draft.id ? draft : step));
      const exposed = { ...old, steps, activeStepId: draft.id };
      const next = typeof update === "function" ? update(exposed) : update;
      let nextDraft = next.steps.find((step) => step.id === draft.id) ?? draft;
      if (
        draft.processor === "resize" &&
        old.viewport.locked &&
        nextDraft.params.mode === "exact"
      ) {
        const ratio = old.editing.inputSize
          ? old.editing.inputSize.width / old.editing.inputSize.height
          : draft.params.width / draft.params.height;
        if (nextDraft.params.width !== draft.params.width)
          nextDraft = {
            ...nextDraft,
            params: {
              ...nextDraft.params,
              height: Math.max(1, Math.round(nextDraft.params.width / ratio)),
            },
          };
        else if (nextDraft.params.height !== draft.params.height)
          nextDraft = {
            ...nextDraft,
            params: {
              ...nextDraft.params,
              width: Math.max(1, Math.round(nextDraft.params.height * ratio)),
            },
          };
      }
      return {
        ...old,
        editing: {
          ...old.editing,
          draft: nextDraft,
          dirty: true,
        },
      };
    });
  return (
    <InspectorLayout title={title} connections={connections}>
      <div className="parameters">
        {current && definition ? (
          <>
            <div className="panel-heading">
              <strong>{definition.name} Parameters</strong>
            </div>
            <p className="hint">{definition.description}</p>
            {current.processor === "resize" && (
              <>
                <label className="field boolean">
                  <span>锁定比例</span>
                  <input
                    type="checkbox"
                    checked={document?.viewport.locked ?? true}
                    onChange={(event) =>
                      commitDocument((old) => ({
                        ...old,
                        viewport: {
                          ...old.viewport,
                          locked: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
                {document?.editing?.inputSize && (
                  <div className="resize-shortcuts">
                    {[25, 50, 100, 150, 200].map((percent) => (
                      <button
                        key={percent}
                        onClick={() =>
                          commitDocument((old) => ({
                            ...old,
                            editing: old.editing?.inputSize
                              ? {
                                  ...old.editing,
                                  draft: {
                                    ...old.editing.draft,
                                    params: {
                                      ...old.editing.draft.params,
                                      mode: "exact",
                                      width: Math.max(
                                        1,
                                        Math.round(
                                          (old.editing.inputSize.width *
                                            percent) /
                                            100
                                        )
                                      ),
                                      height: Math.max(
                                        1,
                                        Math.round(
                                          (old.editing.inputSize.height *
                                            percent) /
                                            100
                                        )
                                      ),
                                    },
                                  },
                                }
                              : old.editing,
                          }))
                        }
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {definition.fields
              .filter(
                (field) =>
                  current.processor !== "resize" ||
                  ["width", "height", "kernel"].includes(field.key)
              )
              .map((field) => (
                <label
                  className={`field ${
                    field.type === "boolean" ? "boolean" : ""
                  }`}
                  key={field.key}
                >
                  <span>{field.label}</span>
                  {field.type === "select" ? (
                    <select
                      value={current.params[field.key]}
                      onChange={(event) =>
                        setDocument((old) => ({
                          ...old,
                          steps: old.steps.map((step) =>
                            step.id === current.id
                              ? {
                                  ...step,
                                  params: {
                                    ...step.params,
                                    [field.key]: event.target.value,
                                  },
                                }
                              : step
                          ),
                        }))
                      }
                    >
                      {field.options?.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field.type === "boolean"
                          ? "checkbox"
                          : field.type === "number"
                          ? "number"
                          : "text"
                      }
                      min={field.min}
                      max={field.max}
                      checked={
                        field.type === "boolean"
                          ? !!current.params[field.key]
                          : undefined
                      }
                      value={
                        field.type === "boolean"
                          ? undefined
                          : current.params[field.key]
                      }
                      onChange={(event) =>
                        setDocument((old) => ({
                          ...old,
                          steps: old.steps.map((step) =>
                            step.id === current.id
                              ? {
                                  ...step,
                                  params: {
                                    ...step.params,
                                    [field.key]:
                                      field.type === "boolean"
                                        ? event.target.checked
                                        : field.type === "number"
                                        ? Number(event.target.value)
                                        : event.target.value,
                                  },
                                }
                              : step
                          ),
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            {draftError && (
              <p className="error" role="alert">
                {draftError}
              </p>
            )}
            {document?.editing && (
              <div className="inspector-actions">
                <button
                  onClick={() =>
                    commitDocument((old) => finishImageEdit(old, false))
                  }
                >
                  取消
                </button>
                <button
                  className="primary"
                  disabled={!!draftError}
                  onClick={() =>
                    commitDocument((old) => finishImageEdit(old, true))
                  }
                >
                  应用
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="hint">从画布左侧选择操作，在此调整参数。</p>
        )}
      </div>
    </InspectorLayout>
  );
}
