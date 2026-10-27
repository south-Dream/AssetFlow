import React, { useEffect, useRef, useState } from "react";
import type { Asset, Step } from "../shared";
import {
  clamp,
  cropDrag,
  resizeDrag,
  type Handle,
  type Rect,
} from "./geometry";
type Preview = Awaited<ReturnType<typeof window.assetFlow.preview>>;
type Props = {
  windowId: string;
  asset: Asset;
  index: number;
  prefix: Step[];
  draft: Step;
  fresh: boolean;
  onInputSize?: (size: { width: number; height: number }) => void;
  viewport: { scale: number; panX: number; panY: number; locked: boolean };
  setViewport: React.Dispatch<
    React.SetStateAction<{
      scale: number;
      panX: number;
      panY: number;
      locked: boolean;
    }>
  >;
  onParams: (params: Record<string, any>) => void;
  onApply: () => void;
  onCancel: () => void;
};
export function VisualEditor({
  windowId,
  asset,
  index,
  prefix,
  draft,
  fresh,
  onInputSize,
  viewport: viewportState,
  setViewport,
  onParams,
  onApply,
  onCancel,
}: Props) {
  const [input, setInput] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [bounds, setBounds] = useState({ width: 600, height: 400 });
  const view = viewportState.scale;
  const pan = { x: viewportState.panX, y: viewportState.panY };
  const locked = viewportState.locked;
  const setView: React.Dispatch<React.SetStateAction<number>> = (update) =>
    setViewport((old) => ({
      ...old,
      scale: typeof update === "function" ? update(old.scale) : update,
    }));
  const setPan: React.Dispatch<
    React.SetStateAction<{ x: number; y: number }>
  > = (update) =>
    setViewport((old) => {
      const next =
        typeof update === "function"
          ? update({ x: old.panX, y: old.panY })
          : update;
      return { ...old, panX: next.x, panY: next.y };
    });
  const setLocked = (locked: boolean) =>
    setViewport((old) => ({ ...old, locked }));
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<any>(null);
  const crop = draft.processor === "crop",
    p = draft.params;
  const prefixKey = JSON.stringify(prefix);
  useEffect(() => {
    let alive = true;
    setInput(null);
    setError("");
    window.assetFlow
      .preview(asset.id, prefix, index, "processed", windowId)
      .then((result) => {
        if (!alive) return;
        setInput(result);
        onInputSize?.({ width: result.width, height: result.height });
        setView(1);
        setPan({ x: 0, y: 0 });
        if (fresh)
          onParams({
            ...p,
            left: 0,
            top: 0,
            width: result.width,
            height: result.height,
            mode: "exact",
            enlarge: true,
          });
        else if (crop) {
          const left = clamp(Math.round(p.left), 0, result.width - 1),
            top = clamp(Math.round(p.top), 0, result.height - 1);
          onParams({
            ...p,
            left,
            top,
            width: clamp(Math.round(p.width), 1, result.width - left),
            height: clamp(Math.round(p.height), 1, result.height - top),
          });
        } else {
          let width = result.width,
            height = result.height;
          if (p.mode === "percent") {
            width = Math.round((width * p.percent) / 100);
            height = Math.round((height * p.percent) / 100);
          } else if (p.mode === "fit" || p.mode === "max") {
            const ratio = Math.min(
              (p.mode === "max" ? p.max : p.width) / width,
              (p.mode === "max" ? p.max : p.height) / height,
              p.enlarge ? Infinity : 1
            );
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          } else {
            width = p.width;
            height = p.height;
          }
          onParams({ ...p, width, height, mode: "exact", enlarge: true });
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [asset.id, prefixKey]);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBounds({ width: r.width, height: r.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = input
    ? Math.max(
        0.001,
        Math.min(
          (bounds.width - 120) / input.width,
          (bounds.height - 120) / input.height,
          1
        )
      ) * view
    : 1;
  const origin = {
    x: input ? (bounds.width - input.width * scale) / 2 + pan.x : 0,
    y: input ? (bounds.height - input.height * scale) / 2 + pan.y : 0,
  };
  const rect: Rect = {
    left: crop ? Number(p.left) : 0,
    top: crop ? Number(p.top) : 0,
    width: Number(p.width),
    height: Number(p.height),
  };
  const valid =
    !!input &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isInteger) &&
    rect.width >= 1 &&
    rect.height >= 1 &&
    rect.width <= 32768 &&
    rect.height <= 32768 &&
    rect.width * rect.height <= 100_000_000 &&
    (!crop ||
      (rect.left >= 0 &&
        rect.top >= 0 &&
        rect.left + rect.width <= input.width &&
        rect.top + rect.height <= input.height));
  function point(e: React.PointerEvent) {
    const b = viewport.current!.getBoundingClientRect();
    return {
      x: clamp(
        Math.round((e.clientX - b.left - origin.x) / scale),
        0,
        input!.width
      ),
      y: clamp(
        Math.round((e.clientY - b.top - origin.y) / scale),
        0,
        input!.height
      ),
    };
  }
  function begin(e: React.PointerEvent, handle: Handle | "draw" | "pan") {
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    viewport.current!.setPointerCapture(e.pointerId);
    gesture.current = {
      handle,
      x: e.clientX,
      y: e.clientY,
      rect: { ...rect },
      pan: { ...pan },
      start: point(e),
      scale,
    };
    viewport.current!.focus();
  }
  function changeSize(key: "width" | "height", value: number) {
    if (!input) return;
    const other = key === "width" ? "height" : "width";
    onParams({
      ...p,
      mode: "exact",
      enlarge: true,
      [key]: value,
      ...(locked
        ? {
            [other]: Math.max(
              1,
              Math.round((value * Number(p[other])) / Number(p[key]))
            ),
          }
        : {}),
    });
  }
  function reset() {
    if (input)
      onParams({
        ...p,
        left: 0,
        top: 0,
        width: input.width,
        height: input.height,
        mode: "exact",
        enlarge: true,
      });
  }
  return (
    <div
      className="visual-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        if (
          e.key === "Enter" &&
          valid &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
          onApply();
        }
      }}
    >
      <div
        className={"preview-area edit-viewport " + (crop ? "cropping" : "")}
        ref={viewport}
        tabIndex={0}
        onWheel={(e) => {
          if (!gesture.current)
            setView((v) => clamp(v * (e.deltaY > 0 ? 0.9 : 1.1), 0.05, 10));
        }}
        onPointerDown={(e) =>
          begin(e, crop && e.button === 0 && !e.altKey ? "draw" : "pan")
        }
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || !input) return;
          const dx = (e.clientX - g.x) / g.scale,
            dy = (e.clientY - g.y) / g.scale;
          if (g.handle === "pan") {
            setPan({
              x: g.pan.x + e.clientX - g.x,
              y: g.pan.y + e.clientY - g.y,
            });
            return;
          }
          if (g.handle === "draw") {
            const end = point(e);
            onParams({
              ...p,
              left: Math.min(g.start.x, end.x),
              top: Math.min(g.start.y, end.y),
              width: Math.max(1, Math.abs(end.x - g.start.x)),
              height: Math.max(1, Math.abs(end.y - g.start.y)),
            });
          } else if (crop)
            onParams({
              ...p,
              ...cropDrag(g.rect, g.handle, dx, dy, input.width, input.height),
            });
          else
            onParams({
              ...p,
              ...resizeDrag(
                g.rect.width,
                g.rect.height,
                dx,
                dy,
                g.handle,
                locked
              ),
              mode: "exact",
              enlarge: true,
            });
        }}
        onPointerUp={() => {
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        {input ? (
          <>
            <img
              className="edit-image"
              draggable={false}
              src={input.url}
              style={{
                left: origin.x,
                top: origin.y,
                width: (crop ? input.width : rect.width) * scale,
                height: (crop ? input.height : rect.height) * scale,
                imageRendering:
                  !crop && p.kernel === "nearest" ? "pixelated" : "auto",
              }}
            />
            {valid && (
              <div
                className={
                  "edit-frame " + (crop ? "crop-frame" : "resize-frame")
                }
                style={{
                  left: origin.x + rect.left * scale,
                  top: origin.y + rect.top * scale,
                  width: rect.width * scale,
                  height: rect.height * scale,
                }}
                onPointerDown={(e) =>
                  begin(
                    e,
                    e.altKey || e.button !== 0 ? "pan" : crop ? "move" : "pan"
                  )
                }
              >
                {crop && (
                  <div className="crop-thirds">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                <span className="frame-size">
                  {rect.width} × {rect.height}
                </span>
                {(crop
                  ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
                  : ["e", "se", "s"]
                ).map((handle) => (
                  <button
                    key={handle}
                    className={"edit-handle handle-" + handle}
                    aria-label={(crop ? "裁剪" : "缩放") + "手柄 " + handle}
                    onPointerDown={(e) => begin(e, handle as Handle)}
                  />
                ))}
              </div>
            )}
            <div
              className="view-controls"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button onClick={() => setView((v) => Math.max(0.05, v / 1.25))}>
                −
              </button>
              <span>视图 {Math.round(view * 100)}%</span>
              <button onClick={() => setView((v) => Math.min(10, v * 1.25))}>
                ＋
              </button>
              <button
                onClick={() => {
                  setView(
                    crop
                      ? 1
                      : Math.min(
                          1,
                          input.width / rect.width,
                          input.height / rect.height
                        )
                  );
                  setPan({ x: 0, y: 0 });
                }}
              >
                适应窗口
              </button>
            </div>
          </>
        ) : (
          <div className="empty">{error || "正在载入此步骤的输入图片…"}</div>
        )}
      </div>
    </div>
  );
}
