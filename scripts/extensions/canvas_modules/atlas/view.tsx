import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasResourceRef, CanvasValues } from "../sdk/contracts";

import { defaultAtlasOptions, packAtlas, type AtlasOptions, type AtlasLayout } from "./packing";

import { validateCanvasConfig, validateValues } from "../../../src/extensions/canvas/config";
import atlasConfig from "./config.json";
import "./view.css";

type Options = AtlasOptions & { trim: boolean; extrusion: number; name: string };
type Recipe = { options: Options; resources: CanvasResourceRef[] };
type Decoded = { resource: CanvasResourceRef; image: ImageBitmap };
type Crop = Decoded & { left: number; top: number; width: number; height: number };
type ExportAttempt = { serial: number; result: Promise<boolean> | null };
type Runtime = { session: object; exportAttempt: () => ExportAttempt; options: Options; resources: readonly CanvasResourceRef[]; selected: string; width: number; height: number; occupancy: number; busy: boolean; error: string; update: (patch: Partial<Options>) => void; remove: () => void; clear: () => void; repack: () => void; restore: () => Promise<void>; export: () => Promise<boolean> };
const defaults: Options = { ...defaultAtlasOptions, trim: false, extrusion: 0, name: "atlas" };
const configuration = validateCanvasConfig(atlasConfig, true);
const layoutKeys = ["width", "height", "maxWidth", "maxHeight", "padding", "margin", "extrusion", "powerOfTwo", "trim"] as const;
function toolValues(options: Options, tool: string): CanvasValues {
  if (tool === "atlas.export") return { "atlas.name": options.name };
  if (tool !== "atlas.layout") return {};
  return { "atlas.layoutMode": options.layout === "grid" ? "规则网格" : "紧凑打包", "atlas.sizeMode": options.sizeMode === "fixed" ? "固定尺寸" : "自动尺寸", ...Object.fromEntries(layoutKeys.map(key => [`atlas.${key}`, options[key]])) };
}
function layoutOptions(base: Options, values: CanvasValues): Options {
  return { ...base, layout: values["atlas.layoutMode"] === "规则网格" ? "grid" : "compact", sizeMode: values["atlas.sizeMode"] === "固定尺寸" ? "fixed" : "auto", ...Object.fromEntries(layoutKeys.map(key => [key, values[`atlas.${key}`]])) } as Options;
}
const runtimes = new Map<string, Runtime>();
export const atlasProperties = (id: string) => ({ "atlas.name": runtimes.get(id)?.options.name ?? "atlas" });
export const setAtlasProperties = (id: string, values: CanvasValues) => {
  if (typeof values["atlas.name"] === "string") runtimes.get(id)?.update({ name: values["atlas.name"] });
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export async function exportAtlasCanvas(windowId: string, prepare?: () => Promise<void>): Promise<boolean> {
  const initial = runtimes.get(windowId);
  if (!initial) return false;
  const serial = initial.exportAttempt().serial;
  let preparationError: unknown;
  try { await prepare?.(); } catch (cause) { preparationError = cause; }
  const current = runtimes.get(windowId);
  if (!current || current.session !== initial.session) return false;
  const attempt = current.exportAttempt();
  if (attempt.serial !== serial) return attempt.result ?? false;
  if (preparationError) throw preparationError;
  return current.export();
}

function cropped(decoded: Decoded, trim: boolean): Crop {
  const { image } = decoded;
  if (!trim) return { ...decoded, left: 0, top: 0, width: image.width, height: image.height };
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = image.width, top = image.height, right = -1, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (pixels[(y * image.width + x) * 4 + 3]) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < 0 ? { ...decoded, left: 0, top: 0, width: 1, height: 1 } : { ...decoded, left, top, width: right - left + 1, height: bottom - top + 1 };
}
function renderAtlas(crops: Crop[], layout: AtlasLayout, extrusion: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas"); canvas.width = layout.width; canvas.height = layout.height;
  const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false;
  const byId = new Map(crops.map(crop => [crop.resource.id, crop]));
  for (const frame of layout.frames) {
    const crop = byId.get(frame.id)!; const { image, left, top, width, height } = crop;
    const x = frame.x + extrusion, y = frame.y + extrusion;
    ctx.drawImage(image, left, top, width, height, x, y, width, height);
    if (!extrusion) continue;
    ctx.drawImage(image, left, top, width, 1, x, y - extrusion, width, extrusion);
    ctx.drawImage(image, left, top + height - 1, width, 1, x, y + height, width, extrusion);
    ctx.drawImage(image, left, top, 1, height, x - extrusion, y, extrusion, height);
    ctx.drawImage(image, left + width - 1, top, 1, height, x + width, y, extrusion, height);
    for (const [sx, sy, dx, dy] of [[left, top, x - extrusion, y - extrusion], [left + width - 1, top, x + width, y - extrusion], [left, top + height - 1, x - extrusion, y + height], [left + width - 1, top + height - 1, x + width, y + height]])
      ctx.drawImage(image, sx, sy, 1, 1, dx, dy, extrusion, extrusion);
  }
  return canvas;
}
function composeAtlas(decoded: Decoded[], options: Options) {
  if (!Number.isInteger(options.extrusion) || options.extrusion < 0 || options.extrusion > 16) throw Error("边缘扩展必须是 0–16 的整数");
  const crops = decoded.map(item => cropped(item, options.trim));
  const layout = packAtlas(crops.map(crop => ({ id: crop.resource.id, name: crop.resource.name, width: crop.width + options.extrusion * 2, height: crop.height + options.extrusion * 2, sourceWidth: crop.image.width, sourceHeight: crop.image.height, offsetX: crop.left, offsetY: crop.top })), options);
  if (layout.width * layout.height > 16 * 1024 * 1024) throw Error("图集超过 1600 万像素，请减小尺寸");
  return { layout, canvas: renderAtlas(crops, layout, options.extrusion) };
}

export function AtlasCanvas({ bridge, windowId, resources, onResources, onNotice, onState, onActivate, onExported, input, onOutput }: {
  bridge: AtlasBridge; windowId: string; resources: readonly CanvasResourceRef[]; onResources: (resources: readonly CanvasResourceRef[]) => void;
  onNotice: (message: string) => void; onState: () => void; onActivate: () => void; onExported?: () => void; input?: unknown; onOutput?: (value: unknown) => void;
}) {
  const key = `assetflow.atlas.${windowId}`;
  const [initial] = useState(() => { try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; } });
  const [options, setOptions] = useState<Options>(() => ({ ...defaults, ...initial.options }));
  const [draftOptions, setDraftOptions] = useState<Options | null>(null);
  const effectiveOptions = draftOptions ?? options;
  const optionsRef = useRef(options); optionsRef.current = options;
  const [decoded, setDecoded] = useState<Decoded[]>([]);
  const [restored, setRestored] = useState(false);
  const [selected, setSelected] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const [revision, setRevision] = useState(0);
  const viewport = useRef<HTMLDivElement>(null); const canvasHost = useRef<HTMLDivElement>(null);
  const decodedRef = useRef(decoded); decodedRef.current = decoded;
  const callbacks = useRef({ onResources, onNotice, onState, onActivate, onExported, onOutput }); callbacks.current = { onResources, onNotice, onState, onActivate, onExported, onOutput };
  const active = useRef(true); const request = useRef(0); const queue = useRef(Promise.resolve());
  const contentRevision = useRef(0);
  const session = useRef({});
  const exportAttempt = useRef<ExportAttempt>({ serial: 0, result: null });
  const edited = useRef(false); const failedRestore = useRef(false);
  const restoreRecipe = useRef<(recipe: Recipe, valid?: () => boolean) => Promise<void>>(async () => {});
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const result = useMemo(() => {
    try { return { ...composeAtlas(decoded, effectiveOptions), error: "" }; }
    catch (cause) { return { layout: null, canvas: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [decoded, effectiveOptions, revision]);
  const fit = () => { const bounds = viewport.current?.getBoundingClientRect(); if (bounds && result.layout) { setZoom(Math.min((bounds.width - 48) / result.layout.width, (bounds.height - 48) / result.layout.height, 4)); setPan({ x: 0, y: 0 }); } };
  useEffect(() => { fit(); }, [result.layout?.width, result.layout?.height]);
  useEffect(() => { canvasHost.current?.replaceChildren(...(result.canvas ? [result.canvas] : [])); }, [result.canvas]);
  useEffect(() => {
    active.current = true;
    const open = (refs: readonly CanvasResourceRef[], replacement?: Options, valid?: () => boolean) => {
      const task = queue.current.catch(() => {}).then(async () => {
        if (!active.current || valid?.() === false) return;
        const unique = refs.filter((ref, index) => refs.findIndex(other => other.id === ref.id) === index && (replacement || !decodedRef.current.some(item => item.resource.id === ref.id)));
        if (!unique.length && !replacement) return;
        if ((replacement ? 0 : decodedRef.current.length) + unique.length > 256) throw Error("单个图集最多接收 256 张图片");
        const token = request.current; const added: Decoded[] = []; setBusy(true); setError("");
        try {
          let pixels = replacement ? 0 : decodedRef.current.reduce((sum, item) => sum + item.image.width * item.image.height, 0);
          for (const resource of unique) {
            if (valid?.() === false) { added.forEach(item => item.image.close()); return; }
            if (!["png", "jpg", "jpeg", "webp"].includes(resource.extension.toLowerCase())) throw Error(`不支持的图片类型：${resource.name}`);
            const bytes = await bridge.read(resource.id);
            const image = await createImageBitmap(new Blob([bytes]));
            if (!active.current || token !== request.current || valid?.() === false) { image.close(); added.forEach(item => item.image.close()); return; }
            pixels += image.width * image.height;
            if (pixels > 64 * 1024 * 1024) { image.close(); throw Error("图片总像素超过 6400 万，请减少图片数量"); }
            added.push({ resource, image });
          }
          const old = decodedRef.current;
          const next = replacement ? added : [...old, ...added];
          contentRevision.current++;
          edited.current = true; failedRestore.current = false;
          decodedRef.current = next; setDecoded(next);
          if (replacement) { optionsRef.current = replacement; setOptions(replacement); setDraftOptions(null); setSelected(""); old.forEach(item => item.image.close()); }
          callbacks.current.onResources(next.map(item => item.resource)); callbacks.current.onState();
        } catch (cause) {
          added.forEach(item => item.image.close());
          if (!active.current || token !== request.current || valid?.() === false) return;
          const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message); throw cause;
        }
        finally { if (active.current) setBusy(false); }
      });
      queue.current = task; return task;
    };
    restoreRecipe.current = (recipe, valid) => open(recipe.resources, recipe.options, valid);
    bridge.open = open;
    bridge.capture = () => ({ options: structuredClone(optionsRef.current), resources: decodedRef.current.map(item => item.resource) });
    bridge.restore = state => {
      const recipe = state as Recipe;
      setDraftOptions(null);
      if (JSON.stringify(recipe.resources) === JSON.stringify(decodedRef.current.map(item => item.resource))) {
        const changed = JSON.stringify(optionsRef.current) !== JSON.stringify(recipe.options);
        optionsRef.current = structuredClone(recipe.options);
        setOptions(optionsRef.current); setError("");
        if (changed) { contentRevision.current++; edited.current = true; callbacks.current.onState(); }
        return Promise.resolve();
      }
      return restoreRecipe.current(recipe);
    };
    bridge.clear = () => restoreRecipe.current({ options: { ...optionsRef.current }, resources: [] });
    const cleanup = () => { bridge.open = undefined; };
    const restore = resources.length ? resources : Array.isArray(initial.resources) ? initial.resources : [];
    if (restore.length) void open(restore).catch(() => { failedRestore.current = true; }).finally(() => { if (active.current) setRestored(true); });
    else setRestored(true);
    return () => { active.current = false; request.current++; cleanup(); decodedRef.current.forEach(item => item.image.close()); decodedRef.current = []; runtimes.delete(windowId); emit(); };
  }, [windowId]);
  const resourceKey = resources.map(ref => ref.id).join("|");
  useEffect(() => {
    if (!restored || failedRestore.current) return;
    try {
      const recipe = JSON.stringify({ options, resources: decoded.map(item => item.resource) });
      localStorage.setItem(key, recipe);
      if (edited.current) localStorage.setItem("assetflow.atlas.latest", recipe);
    }
    catch { callbacks.current.onNotice("无法保存图集会话，浏览器存储空间不足"); }
  }, [decoded, options, resourceKey, restored]);
  const update = (patch: Partial<Options>) => {
    const next = { ...optionsRef.current, ...patch }; setDraftOptions(null); setError("");
    if (JSON.stringify(next) === JSON.stringify(optionsRef.current)) return;
    contentRevision.current++; edited.current = true; optionsRef.current = next; setOptions(next); callbacks.current.onState();
  };
  const replace = (next: Decoded[]) => { contentRevision.current++; edited.current = true; failedRestore.current = false; decodedRef.current = next; setDecoded(next); setSelected(""); callbacks.current.onResources(next.map(item => item.resource)); callbacks.current.onState(); };
  const restoreLatest = async () => {
    try {
      const recipe = JSON.parse(localStorage.getItem("assetflow.atlas.latest") ?? "null") as Recipe | null;
      if (!recipe || !recipe.options || !Array.isArray(recipe.resources) || !recipe.resources.length) throw Error("没有可恢复的图集，请先拖入图片创建图集");
      await restoreRecipe.current({ options: { ...defaults, ...recipe.options }, resources: recipe.resources });
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message); }
  };
  const performExportImage = async (explicitOptions?: Options, explicitRevision?: number) => {
    if (!decodedRef.current.length || busy) return false;
    const snapshotOptions = explicitOptions ?? optionsRef.current;
    const exportedRevision = explicitRevision ?? contentRevision.current, generation = request.current;
    let snapshot: ReturnType<typeof composeAtlas>;
    try { snapshot = composeAtlas(decodedRef.current, snapshotOptions); }
    catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message); return false; }
    setBusy(true); setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => snapshot.canvas.toBlob(value => value ? resolve(value) : reject(Error("PNG 编码失败")), "image/png"));
      const metadata = { schemaVersion: 1, image: `${snapshotOptions.name || "atlas"}.png`, meta: { image: `${snapshotOptions.name || "atlas"}.png`, size: { w: snapshot.layout.width, h: snapshot.layout.height }, scale: "1" }, size: { width: snapshot.layout.width, height: snapshot.layout.height }, frames: snapshot.layout.frames.map(frame => ({ id: frame.id, name: frame.name, frame: { x: frame.x + snapshotOptions.extrusion, y: frame.y + snapshotOptions.extrusion, w: frame.width - snapshotOptions.extrusion * 2, h: frame.height - snapshotOptions.extrusion * 2 }, rotated: false, trimmed: !!snapshotOptions.trim && (frame.offsetX !== 0 || frame.offsetY !== 0 || frame.sourceWidth !== frame.width - snapshotOptions.extrusion * 2 || frame.sourceHeight !== frame.height - snapshotOptions.extrusion * 2), sourceSize: { w: frame.sourceWidth, h: frame.sourceHeight }, spriteSourceSize: { x: frame.offsetX ?? 0, y: frame.offsetY ?? 0, w: frame.width - snapshotOptions.extrusion * 2, h: frame.height - snapshotOptions.extrusion * 2 } })) };
      const saved = await window.assetFlow.atlas.export(await blob.arrayBuffer(), JSON.stringify(metadata, null, 2), snapshotOptions.name || "atlas");
      if (saved && active.current && request.current === generation) {
        callbacks.current.onNotice("图集 PNG 与 JSON 已导出");
        if (contentRevision.current === exportedRevision) callbacks.current.onExported?.();
      }
      return saved;
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message); return false; }
    finally { if (active.current) setBusy(false); }
  };
  const exportImage = (explicitOptions?: Options, explicitRevision?: number) => {
    const result = performExportImage(explicitOptions, explicitRevision);
    exportAttempt.current = { serial: exportAttempt.current.serial + 1, result };
    return result;
  };
  useEffect(() => {
    const runtime: Runtime = { session: session.current, exportAttempt: () => exportAttempt.current, options, resources: decoded.map(item => item.resource), selected, width: result.layout?.width ?? 0, height: result.layout?.height ?? 0, occupancy: result.layout?.occupancy ?? 0, busy, error: error || result.error, update, remove: () => { const item = decodedRef.current.find(item => item.resource.id === selected); replace(decodedRef.current.filter(item => item.resource.id !== selected)); item?.image.close(); }, clear: () => { request.current++; const old = decodedRef.current; replace([]); old.forEach(item => item.image.close()); setError(""); }, repack: () => { setRevision(old => old + 1); fit(); }, restore: restoreLatest, export: exportImage };
    runtimes.set(windowId, runtime); emit(); bridge.changed?.();
  }, [options, decoded, selected, result, busy, error]);
  bridge.params = tool => toolValues(optionsRef.current, tool);
  useEffect(() => {
    const report = (cause: unknown) => { const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message); };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.windowId !== windowId) return;
      if (event.type === "assetflow:command") {
        const command = configuration.tools.find(tool => tool.command === detail.command);
        if (!command || command.kind !== "command") return;
        const execute = async () => {
          if (command.id === "atlas.fit") { fit(); return; }
          if (command.id === "atlas.actualSize") { setZoom(1); setPan({ x: 0, y: 0 }); return; }
          if (busy) throw Error("图集正在处理，请稍后再试");
          const runtime = runtimes.get(windowId);
          if (command.id === "atlas.remove") { if (!selected) throw Error("请先在画布中选择要移除的图片"); runtime?.remove(); }
          if (command.id === "atlas.clear") runtime?.clear();
          if (command.id === "atlas.restore") await restoreLatest();
          if (command.id === "atlas.repack") runtime?.repack();
        };
        void execute().then(() => detail.resolve?.()).catch(cause => { report(cause); detail.reject?.(cause); }); return;
      }
      const tool = configuration.tools.find(tool => tool.id === detail.tool && tool.kind !== "command");
      if (!tool || !["preview", "apply", "cancel"].includes(detail.phase)) return;
      if (detail.resolve) event.preventDefault();
      const execute = async () => {
        if (detail.phase === "cancel") { setDraftOptions(null); setError(""); return; }
        const values = validateValues(tool.fields ?? [], detail.params ?? {});
        const next = tool.id === "atlas.layout" ? layoutOptions(optionsRef.current, values) : { ...optionsRef.current, name: String(values["atlas.name"]) };
        if (detail.phase === "preview") { setDraftOptions(next); setError(""); return; }
        if (busy) throw Error("图集正在处理，请稍后再试");
        composeAtlas(decodedRef.current, next);
        update(next);
        if (tool.id === "atlas.export" && !await exportImage(next, contentRevision.current)) throw Error("图集未导出，请检查参数或重新选择输出目录");
      };
      void execute().then(() => { detail.resolve?.(); }).catch(cause => { report(cause); detail.reject?.(cause); });
    };
    bridge.receive = receive; bridge.changed?.();
    return () => { bridge.receive = undefined; };
  }, [windowId, options, decoded, selected, result, busy]);
  const outputFingerprint = useRef("");
  const inputGeneration = useRef(0);
  const incoming = JSON.stringify(input ?? null);
  useEffect(() => {
    const generation = ++inputGeneration.current;
    if (!input || typeof input !== "object" || (input as { kind?: string }).kind !== "assetflow.atlas.v1") return;
    const recipe = input as Recipe & { kind: string };
    if (!recipe.options || !Array.isArray(recipe.resources) || recipe.resources.length > 256) return;
    const fingerprint = JSON.stringify({ options: { ...defaults, ...recipe.options }, resources: recipe.resources });
    const committed = JSON.stringify({ options: optionsRef.current, resources: decodedRef.current.map(item => item.resource) });
    if (fingerprint === committed) return;
    const valid = () => active.current && generation === inputGeneration.current;
    void restoreRecipe.current({ options: { ...defaults, ...recipe.options }, resources: recipe.resources }, valid).catch(cause => {
      if (!valid()) return;
      const message = cause instanceof Error ? cause.message : String(cause); setError(message); callbacks.current.onNotice(message);
    });
  }, [incoming]);
  useEffect(() => {
    if (!restored || failedRestore.current) return;
    const recipe = { options, resources: decoded.map(item => item.resource) };
    const fingerprint = JSON.stringify(recipe);
    if (outputFingerprint.current === fingerprint) return;
    outputFingerprint.current = fingerprint;
    callbacks.current.onOutput?.({ kind: "assetflow.atlas.v1", ...recipe });
  }, [options, decoded, restored]);
  return <div ref={viewport} className="atlas-viewport" tabIndex={0} onPointerDown={event => { callbacks.current.onActivate(); if (event.button === 1 || event.altKey) { drag.current = { x: event.clientX, y: event.clientY, pan }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); } }} onPointerMove={event => { if (drag.current) setPan({ x: drag.current.pan.x + event.clientX - drag.current.x, y: drag.current.pan.y + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onWheel={event => { setZoom(old => Math.max(.02, Math.min(16, old * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))); }}>
    <span className="atlas-zoom">{Math.round(zoom * 100)}%</span>
    {!decoded.length ? <p className="atlas-empty">{busy ? "正在读取图片…" : "从层级拖入图片，自动生成图集"}</p> : result.layout && <div className="atlas-sheet" role="listbox" aria-label="图集图片" style={{ width: result.layout.width, height: result.layout.height, transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
      <div ref={canvasHost} className="atlas-pixels" />
      {result.layout.frames.map(frame => <div key={frame.id} role="option" aria-selected={selected === frame.id} tabIndex={0} className={`atlas-frame${selected === frame.id ? " selected" : ""}`} title={`${frame.name} · ${frame.width - effectiveOptions.extrusion * 2} × ${frame.height - effectiveOptions.extrusion * 2}`} aria-label={`选择 ${frame.name}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} onClick={() => setSelected(frame.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(frame.id); } }} />)}
    </div>}
    <span className="atlas-help">滚轮缩放 · Alt / 中键拖动平移</span>
  </div>;
}

export type AtlasBridge = { capture?: () => unknown; restore?: (state: unknown) => Promise<void>; clear?: () => Promise<void>; read: (id: string) => Promise<ArrayBuffer>; changed?: () => void; open?: (refs: readonly CanvasResourceRef[]) => Promise<void>; receive?: (event: Event) => void; params?: (tool: string) => CanvasValues };
export function atlasSummary(windowId: string): string { const r = runtimes.get(windowId); return r ? `${r.resources.length} images | ${r.width} x ${r.height} | ${Math.round(r.occupancy * 100)}%${r.error ? " | " + r.error : ""}${r.selected ? " | " + r.resources.find(ref => ref.id === r.selected)?.name : ""}` : "..."; }

export function atlasError(windowId: string): string { return runtimes.get(windowId)?.error ?? ""; }
