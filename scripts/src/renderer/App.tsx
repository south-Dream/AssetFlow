import React, { useEffect, useRef, useState } from "react";
import type { Asset, Progress } from "../shared";
import type { PanelSnapshot } from "../shared";
import { droppedFilePaths } from "../shared/importPaths";
import { ImageWorkspace } from "./ImageWorkspace";
import { createImageResourceAPI } from "../../extensions/canvas_moudles/image/resourceHandler";
import { matchResourceRule, toResourceRef } from "../extensions/canvas/resources";
import type { CanvasResourceRef } from "../extensions/canvas/contracts";
import {
  hasCanvasResourceOpener,
  openCanvasResources,
  registerCanvasResourceOpener,
  resourceHostRevision,
  subscribeResourceHost,
} from "./workspace/resourceHost";
import { DockLayout } from "./workspace/DockLayout";
import { HierarchyPanel } from "./workspace/HierarchyPanel";
import {
  activateDockPanel,
  createDefaultSettings,
  createDockNode,
  createWindow,
  firstDockPanel,
  insertDockPanel,
  moveDockPanel,
  openDockPanel,
  removeDockPanel,
  resizeDockSplit,
  validateWindowLimit,
  type DockNode,
  type DockPanelId,
  type WorkspaceSettings,
  type WorkspaceWindow,
} from "./workspace/model";
import type { ImageDocument, ImageWorkspaceState } from "./ImageWorkspace";
import { ApplicationNavigation, ExtensionPanelView, SystemExtensionRuntimes, useSystemExtensions } from "./workspace/SystemExtensions";
import { ResultPanel } from "./workspace/ResultPanel";
import {
  createHierarchy,
  includeAssets,
  collectAssets,
  collectFolders,
  folderPath,
  type Hierarchy,
} from "./workspace/hierarchy";
import { Inspector } from "./workspace/Inspector";
import { CanvasConnections } from "./workspace/CanvasConnections";
import {
  canLinkCanvas,
  resolveCanvas,
  resolvePreviewCanvas,
} from "./workspace/canvasLinks";
import { PanelToolbar } from "./workspace/PanelToolbar";
import { CanvasBaseProperties } from "./workspace/CanvasBaseProperties";
import {
  getCanvasPreferences,
  setCanvasPreferences,
} from "./workspace/canvasPreferences";
import { ToolSwitchDialog, confirmToolSwitch } from "./workspace/toolSwitch";
import { imageDraftChanged, imageDraftError, finishImageEdit } from "./workspace/imageEditing";
import { acceptCanvasCommand } from "./workspace/canvasPreferences";
import { CanvasToolbox } from "./workspace/CanvasToolbox";
import { ModuleManager } from "./workspace/ModuleManager";
import { saveCanvas } from "./workspace/canvasSaveHost";
import { prepareCanvasSave, canvasInspectorDirty } from "./workspace/canvasSavePreparation";
import { ExportSelectionDialog } from "./workspace/ExportSelectionDialog";
import { ImageOutputDialog } from "./workspace/ImageOutputDialog";
import { CanvasSettings } from "./workspace/CanvasSettings";
import { ExtensionCanvas } from "./workspace/ExtensionCanvas";
import { ExtensionInspector } from "./workspace/ExtensionInspector";
import {
  configFor,
  refreshModules,
  useModules,
} from "./workspace/moduleRegistry";
import { getPanelTypes, subscribePanelTypes } from "./workspace/panelTypes";
import { ReplacePanelDialog } from "./workspace/ReplacePanelDialog";
import { panelFingerprint, panelIsDirty } from "./workspace/panelDocument";
import {
  acceptsAsset,
  assetTypes,
  defaultAssetIcons,
  type AssetIcons,
} from "./workspace/assetTypes";
import "./app-workspace.css";

export function Workspace() {
  useModules();
  React.useSyncExternalStore(subscribeResourceHost, resourceHostRevision);
  const [canvasResources, setCanvasResources] = useState<
    Record<string, readonly CanvasResourceRef[]>
  >({});
  const resourceAssets = useRef(new Map<string, Asset>());
  useEffect(() => {
    const start = (event: DragEvent) => {
      if (
        event.dataTransfer &&
        !event.dataTransfer.types.includes("application/assetflow-dock")
      )
        document.body.classList.add("canvas-resource-dragging");
    };
    const stop = () =>
      document.body.classList.remove("canvas-resource-dragging");
    const leave = (event: DragEvent) => {
      if (
        !event.relatedTarget &&
        (event.clientX <= 0 ||
          event.clientY <= 0 ||
          event.clientX >= innerWidth ||
          event.clientY >= innerHeight)
      )
        stop();
    };
    document.addEventListener("dragenter", start, true);
    document.addEventListener("dragstart", start, true);
    document.addEventListener("drop", stop, true);
    document.addEventListener("dragend", stop, true);
    document.addEventListener("dragleave", leave, true);
    return () => {
      stop();
      document.removeEventListener("dragenter", start, true);
      document.removeEventListener("dragstart", start, true);
      document.removeEventListener("drop", stop, true);
      document.removeEventListener("dragend", stop, true);
      document.removeEventListener("dragleave", leave, true);
    };
  }, []);
  const types = React.useSyncExternalStore(subscribePanelTypes, getPanelTypes);
  const [imageOutput, setImageOutput] = useState<{
    assetId: string;
    steps: import("../shared").Step[];
  }>();
  const [moduleManagerOpen, setModuleManagerOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<{
    type: string;
    section: string;
    windowId?: string;
  }>({
    type: "",
    section: "settings",
  });
  const [extensionOutputs, setExtensionOutputs] = useState<
    Record<string, unknown>
  >({});
  const [extensionDirty, setExtensionDirty] = useState<Record<string, boolean>>(
    {}
  );
  useEffect(() => {
    const changed = (event: Event) =>
      setExtensionDirty((old) => ({
        ...old,
        [(event as CustomEvent).detail.windowId]: true,
      }));
    window.addEventListener("assetflow:canvas-properties-changed", changed);
    return () =>
      window.removeEventListener(
        "assetflow:canvas-properties-changed",
        changed
      );
  }, []);
  const [initialHierarchyId] = useState(() => crypto.randomUUID());
  const [hierarchies, setHierarchies] = useState<Hierarchy[]>(() => [
    { ...createHierarchy("层级"), id: initialHierarchyId },
  ]);
  const [initialWindows] = useState<WorkspaceWindow[]>(() => [
    createWindow(0),
    createWindow(1),
  ]);
  const [windows, setWindows] = useState<WorkspaceWindow[]>(initialWindows);
  const [documents, setDocuments] = useState<Record<string, ImageDocument>>({});
  const documentsRef = useRef(documents); documentsRef.current = documents;
  const imageCommandQueue = useRef(Promise.resolve());
  const [canvasLinks, setCanvasLinks] = useState<Record<string, string>>({});
  const [canvasStates, setCanvasStates] = useState<
    Record<string, ImageWorkspaceState>
  >({});
  const [dock, setDock] = useState<DockNode>(() => {
    const hierarchy = createDockNode(`hierarchy:${initialHierarchyId}`);
    const firstCanvas = createDockNode(`canvas:${initialWindows[0].id}`);
    const secondCanvas = createDockNode(`canvas:${initialWindows[1].id}`);
    const inspector = createDockNode("inspector");
    return {
      kind: "split",
      id: crypto.randomUUID(),
      axis: "horizontal",
      ratio: 0.22,
      first: hierarchy,
      second: {
        kind: "split",
        id: crypto.randomUUID(),
        axis: "horizontal",
        ratio: 0.72,
        first: {
          kind: "split",
          id: crypto.randomUUID(),
          axis: "horizontal",
          ratio: 0.5,
          first: firstCanvas,
          second: secondCanvas,
        },
        second: inspector,
      },
    };
  });
  const [activePanel, setActivePanelState] = useState<DockPanelId>(
    `canvas:${initialWindows[0].id}`
  );
  const [activeCanvasId, setActiveCanvasId] = useState(initialWindows[0].id);
  const [assets, setAssets] = useState<Asset[]>([]);
  assets.forEach((asset) => resourceAssets.current.set(asset.id, asset));
  useEffect(() => {
    const disposers = windows
      .filter((canvas) => canvas.mode === "image" && !canvas.readOnly)
      .map((canvas) => {
        const api = createImageResourceAPI((ref) => {
          const asset = resourceAssets.current.get(ref.id);
          if (!asset) throw Error("图片资源已失效");
          bindAsset(canvas.id, asset);
        });
        const unregister = registerCanvasResourceOpener(canvas.id, (refs) =>
          api.open(refs)
        );
        return () => {
          unregister();
          void api.dispose();
        };
      });
    return () => disposers.forEach((dispose) => dispose());
  }, [windows]);
  const [activeHierarchyId, setActiveHierarchyId] =
    useState<string>(initialHierarchyId);
  const [selection, setSelection] = useState<string[]>([]);
  const [exportScope, setExportScope] = useState<"all" | "selected" | null>(
    null
  );
  const [importOpen, setImportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportApproval, setExportApproval] = useState<{ groups: { name: string; canvases: WorkspaceWindow[]; selected: string }[]; resolve: (value:string[]|null)=>void }>();
  const [panelAssets, setPanelAssets] = useState<Record<string, string>>({});
  const [savedPanels, setSavedPanels] = useState<Record<string, PanelSnapshot>>(
    {}
  );
  const [historyPanels, setHistoryPanels] = useState<Record<string, boolean>>(
    {}
  );
  const panelEpoch = useRef<Record<string, number>>({});
  const panelRevisions = useRef<Record<string, number>>({});
  const extensionVersions = useRef<Record<string, number>>({});
  const savingPanels = useRef(new Set<string>());
  const latestPanels = useRef<Record<string, PanelSnapshot>>({});
  const [icons, setIcons] = useState<AssetIcons>(() => {
    try {
      return {
        ...defaultAssetIcons(),
        ...JSON.parse(localStorage.getItem("assetflow.assetIcons") ?? "{}"),
      };
    } catch {
      return defaultAssetIcons();
    }
  });
  const [replacement, setReplacement] = useState<{
    windowId: string;
    asset: Asset;
  } | null>(null);
  const [savingReplacement, setSavingReplacement] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings>(
    createDefaultSettings
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const systemExtensions = useSystemExtensions();
  const [systemDialog, setSystemDialog] = useState("");
  const [systemSettingsPanel, setSystemSettingsPanel] = useState("");
  const [systemSettingsRequest, setSystemSettingsRequest] = useState(0);
  useEffect(() => {
    const open = (event: Event) => {
      const { panel, host } = (event as CustomEvent).detail;
      if (host === "settings") { setSystemSettingsPanel(panel); setSystemSettingsRequest(old => old + 1); setSettingsOpen(true); }
      else if (host === "dock") {
        const id: DockPanelId = `extension:${panel}`;
        setDock(old => openDockPanel(old, id));
        setActivePanelState(id);
      } else setSystemDialog(panel);
    };
    const notice = (event: Event) => setNotice(String((event as CustomEvent).detail));
    window.addEventListener("assetflow:open-system-panel", open);
    window.addEventListener("assetflow:system-notice", notice);
    return () => { window.removeEventListener("assetflow:open-system-panel", open); window.removeEventListener("assetflow:system-notice", notice); };
  }, []);
  useEffect(() => {
    void refreshModules().catch((error) => setNotice(String(error)));
  }, []);
  useEffect(() => {
    const settings = (event: Event) => {
      setSettingsTarget((event as CustomEvent).detail);
      setSettingsOpen(true);
    };
    window.addEventListener("assetflow:settings", settings);
    return () => window.removeEventListener("assetflow:settings", settings);
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const { windowId, command } = (event as CustomEvent).detail;
      const canvas = windows.find(item => item.id === windowId);
      if (canvas?.mode !== "image" || !configFor("image")?.tools.some(tool => tool.command === command)) return;
      const execute = async () => {
        const processor = command.slice(6);
        if (!resolveCanvas(windowId, canvasLinks, panelAssets, documentsRef.current).assetId) { setNotice("请先选择输入图片"); return; }
        const definitions = await window.assetFlow.definitions();
        const definition = definitions.find(item => item.id === processor);
        if (!definition) return;
        let current = documentsRef.current[windowId] ?? emptyDocument();
        if (current.editing?.draft.processor === processor) return;
        if (imageDraftChanged(current)) {
          const oldName = definitions.find(item => item.id === current.editing?.draft.processor)?.name ?? "当前工具";
          const choice = await confirmToolSwitch(oldName, definition.name, () => imageDraftError(documentsRef.current[windowId] ?? emptyDocument()));
          if (choice === "cancel") return;
          current = documentsRef.current[windowId] ?? emptyDocument();
          if (choice === "apply" && imageDraftError(current)) { setNotice(imageDraftError(current)); return; }
          current = finishImageEdit(current, choice === "apply");
        } else current = finishImageEdit(current, false);
        const draft = { id: crypto.randomUUID(), processor, enabled: true, params: Object.fromEntries(definition.fields.map(field => [field.key, field.default])) };
        const next: ImageDocument = { ...current, editing: { draft, prefix: current.steps, fresh: true, initialParams: ["crop", "resize"].includes(processor) ? undefined : structuredClone(draft.params) } };
        documentsRef.current = { ...documentsRef.current, [windowId]: next };
        setDocuments(old => ({ ...old, [windowId]: next }));
        setActiveCanvasId(windowId);
        acceptCanvasCommand(windowId, command);
      };
      imageCommandQueue.current = imageCommandQueue.current.then(execute).catch(error => setNotice(String(error)));
    };
    window.addEventListener("assetflow:command-request", listener);
    return () => window.removeEventListener("assetflow:command-request", listener);
  }, [windows, canvasLinks, panelAssets]);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    panel: DockPanelId;
  } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const recursive = true;
  const activeWindow =
    windows.find((item) => item.id === activeCanvasId) ?? windows[0];
  latestPanels.current = Object.fromEntries(
    windows.flatMap((item) => {
      const resolved = resolveCanvas(
        item.id,
        canvasLinks,
        panelAssets,
        documents
      );
      const asset = assets.find((a) => a.id === resolved.assetId);
      return asset && !item.readOnly
        ? [
            [
              item.id,
              {
                version: 1,
                sourcePath: asset.path,
                mode: item.mode,
                canvasProperties: getCanvasPreferences(item.mode, item.id)
                  .properties,
                steps: resolved.steps,
              } satisfies PanelSnapshot,
            ],
          ]
        : [];
    })
  );

  useEffect(() => window.assetFlow.onProgress(setProgress), []);
  useEffect(() => {
    localStorage.setItem("assetflow.assetIcons", JSON.stringify(icons));
  }, [icons]);
  useEffect(() => {
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      )
        return;
      event.preventDefault();
      if (
        event.repeat ||
        document.querySelector(".settings-backdrop") ||
        settingsOpen ||
        moduleManagerOpen ||
        exportScope ||
        replacement
      )
        return;
      if (!activePanel.startsWith("canvas:") && activePanel !== "inspector") {
        setNotice("请先选中需要保存的编辑面板");
        return;
      }
      if (
        activePanel.startsWith("canvas:") &&
        windows.find((w) => w.id === activePanel.slice(7))?.readOnly
      ) {
        setNotice("结果预览为只读，请选中编辑面板保存");
        return;
      }
      void action(() => savePanel(activeCanvasId));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  async function savePanel(windowId: string): Promise<boolean> {
    const canvas = windows.find((w) => w.id === windowId);
    const epoch = panelEpoch.current[windowId] ?? 0;
    if (canvas && canvas.mode !== "image" && !canvas.readOnly) {
      const refs = canvasResources[windowId] ?? [];
      if (refs.length !== 1) { setNotice("保存需要画布关联一个资产"); return false; }
      const asset = assets.find(item => item.id === refs[0].id);
      const expectedRevision = asset?.revision ?? 0;
      if (!asset || !window.assetFlow.workspace) return false;
      if (savingPanels.current.has(windowId)) return false;
      savingPanels.current.add(windowId);
      try {
        await prepareCanvasSave(windowId);
        const version = extensionVersions.current[windowId] ?? 0;
        if ((panelEpoch.current[windowId] ?? 0) !== epoch) return false;
        const result = await saveCanvas(windowId);
        if ((panelEpoch.current[windowId] ?? 0) !== epoch) return false;
        const updated = await window.assetFlow.workspace.saveBytes(asset.id, result.data, result.name, expectedRevision);
        setAssets(old => old.map(item => item.id === updated.id ? updated : item));
        if ((panelEpoch.current[windowId] ?? 0) !== epoch || latestPanels.current[windowId]?.sourcePath !== asset.path) return true;
        panelRevisions.current[windowId] = updated.revision ?? 0;
        if ((extensionVersions.current[windowId] ?? 0) === version) setExtensionDirty(old => ({ ...old, [windowId]: false }));
        const snapshot = latestPanels.current[windowId];
        if (snapshot) setSavedPanels(old => ({ ...old, [windowId]: structuredClone(snapshot) }));
        setNotice("当前画布已保存到内部资产");
        return true;
      } finally { savingPanels.current.delete(windowId); }
    }
    const snapshot = latestPanels.current[windowId];
    if (!snapshot) {
      setNotice("请先向编辑面板拖入资源");
      return false;
    }
    if (savingPanels.current.has(windowId)) return false;
    const originalDocument = documentsRef.current[windowId];
    let capturedDocument = originalDocument;
    if (originalDocument?.editing) {
      const error = imageDraftError(originalDocument);
      if (error) { setNotice(error); return false; }
      capturedDocument = finishImageEdit(originalDocument, true);
    }
    savingPanels.current.add(windowId);
    try {
      const captured = structuredClone({
        ...snapshot,
        steps: capturedDocument && capturedDocument !== originalDocument
          ? resolveCanvas(windowId, canvasLinks, panelAssets, { ...documentsRef.current, [windowId]: capturedDocument }).steps : snapshot.steps,
        canvasProperties: getCanvasPreferences(snapshot.mode, windowId)
          .properties,
      });
      const asset = assets.find((a) => a.path === captured.sourcePath);
      if (!asset) return false;
      if (!window.assetFlow.workspace) throw Error("内部资产保存服务不可用");
      const updated = await window.assetFlow.workspace.saveImage(asset.id, captured.steps, asset.revision ?? 0);
      setAssets(old => old.map(item => item.id === updated.id ? updated : item));
      if ((panelEpoch.current[windowId] ?? 0) !== epoch || latestPanels.current[windowId]?.sourcePath !== asset.path) return true;
      panelRevisions.current[windowId] = updated.revision ?? 0;
      if (capturedDocument && documentsRef.current[windowId] === originalDocument) {
        documentsRef.current = { ...documentsRef.current, [windowId]: capturedDocument };
        setDocuments(old => ({ ...old, [windowId]: capturedDocument! }));
      }
      setSavedPanels((old) => ({ ...old, [windowId]: captured }));
      if (
        latestPanels.current[windowId] &&
        panelFingerprint(latestPanels.current[windowId]) ===
          panelFingerprint(captured)
      ) {
        setHistoryPanels((old) => ({ ...old, [windowId]: false }));
        setExtensionDirty((old) => ({ ...old, [windowId]: false }));
        setDocuments((old) => ({
          ...old,
          [windowId]: {
            ...(old[windowId] ?? EMPTY_DOCUMENT),
            activeStepId: "",
          },
        }));
      }
      setNotice("当前画布已保存到内部资产，源文件保持不变");
      return true;
    } finally {
      savingPanels.current.delete(windowId);
    }
  }

  function openImageOutput() {
    if (!activeWindow || activeWindow.mode !== "image") {
      setNotice("请选择图片画布");
      return;
    }
    if (documents[activeCanvasId]?.editing) {
      setNotice("请先应用或取消当前操作");
      return;
    }
    const resolved = resolveCanvas(
      activeCanvasId,
      canvasLinks,
      panelAssets,
      documents
    );
    if (!resolved.assetId) {
      setNotice("请先打开图片");
      return;
    }
    setImageOutput({
      assetId: resolved.assetId,
      steps: structuredClone(resolved.steps),
    });
  }
  async function openPanel() {
    if (windows.filter((w) => !w.readOnly).length >= settings.maxCanvasCount)
      throw Error("已达到面板数量上限，请先调整设置或关闭其他面板");
    const loaded = await window.assetFlow.loadPanel();
    if (!loaded) return;
    const { snapshot, asset } = loaded;
    const item = createWindow(windows.length, snapshot.mode);
    if (snapshot.canvasProperties)
      setCanvasPreferences(
        snapshot.mode,
        { properties: snapshot.canvasProperties },
        item.id
      );
    const panel: DockPanelId = `canvas:${item.id}`;
    setAssets((old) => [
      ...new Map([...old, asset].map((a) => [a.id, a])).values(),
    ]);
    setHierarchies((old) =>
      old.map((h) =>
        h.id === activeHierarchyId
          ? includeAssets(
              h,
              [asset].filter((a) => !h.assetIds.includes(a.id)),
              null
            )
          : h
      )
    );
    setWindows((old) => [...old, item]);
    setPanelAssets((old) => ({ ...old, [item.id]: asset.id }));
    setDocuments((old) => ({
      ...old,
      [item.id]: { ...emptyDocument(), steps: snapshot.steps },
    }));
    setSavedPanels((old) => ({ ...old, [item.id]: snapshot }));
    setDock((old) =>
      insertDockPanel(
        old,
        panel,
        findActiveGroup(old, activePanel) ?? old.id,
        "center"
      )
    );
    setActiveCanvasId(item.id);
    setActivePanelState(panel);
  }

  function activatePanel(panel: DockPanelId, groupId?: string) {
    setActivePanelState(panel);
    if (
      panel.startsWith("hierarchy:") &&
      activeHierarchyId !== panel.slice(10)
    ) {
      setActiveHierarchyId(panel.slice(10));
      setSelection([]);
    }
    if (
      panel.startsWith("canvas:") &&
      !windows.find((w) => w.id === panel.slice(7))?.readOnly
    )
      setActiveCanvasId(panel.slice(7));
    if (groupId) setDock((old) => activateDockPanel(old, groupId, panel));
  }

  function invalidateCanvasBinding(windowId: string) {
    const affected = new Set([windowId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [target, source] of Object.entries(canvasLinks)) {
        if (affected.has(source) && !affected.has(target)) { affected.add(target); changed = true; }
      }
    }
    for (const id of affected) panelEpoch.current[id] = (panelEpoch.current[id] ?? 0) + 1;
  }

  function bindAsset(windowId: string, asset: Asset) {
    invalidateCanvasBinding(windowId);
    panelRevisions.current[windowId] = asset.revision ?? 0;
    setCanvasLinks((old) => {
      const next = { ...old };
      delete next[windowId];
      return next;
    });
    setPanelAssets((old) => ({ ...old, [windowId]: asset.id }));
    const document = { ...emptyDocument(), steps: structuredClone(asset.savedSteps ?? []) };
    documentsRef.current = { ...documentsRef.current, [windowId]: document };
    setDocuments(old => ({ ...old, [windowId]: document }));
    const mode = windows.find(item => item.id === windowId)?.mode ?? "image";
    setSavedPanels(old => ({ ...old, [windowId]: { version: 1, sourcePath: asset.path, mode, steps: document.steps, canvasProperties: getCanvasPreferences(mode, windowId).properties } }));
    setHistoryPanels((old) => ({ ...old, [windowId]: false }));
  }

  async function dropOnPanel(event: React.DragEvent, item: WorkspaceWindow) {
    if (event.dataTransfer.types.includes("application/assetflow-dock")) return;
    event.preventDefault();
    event.stopPropagation();
    if (
      !configFor(item.mode)?.resources?.length ||
      !hasCanvasResourceOpener(item.id)
    ) {
      setNotice("此画布未配置或尚未注册资源入口");
      return;
    }
    const raw = event.dataTransfer.getData("application/assetflow-assets");
    const id = event.dataTransfer.getData("application/assetflow-asset");
    const files = Array.from(event.dataTransfer.files);
    activatePanel(`canvas:${item.id}`);
    try {
      const ids = raw ? JSON.parse(raw) : id ? [id] : [];
      if (!Array.isArray(ids) || ids.some((value) => typeof value !== "string"))
        throw Error("无效拖放资源列表");
      const incoming = ids.length
        ? assets.filter((a) => ids.includes(a.id))
        : await window.assetFlow.drop(
            droppedFilePaths(files, window.assetFlow.filePath),
            true
          );
      await openAssetsOnCanvas(item, incoming);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function openAssetsOnCanvas(item: WorkspaceWindow, resources: Asset[]) {
    if (!hasCanvasResourceOpener(item.id))
      throw Error("此画布的资源入口尚未注册或模块未就绪");
    if (
      resources.some((asset) => asset.error) ||
      !matchResourceRule(
        configFor(item.mode)?.resources ?? [],
        resources.map(toResourceRef)
      )
    )
      throw Error(
        "此画布不接收这些资源，或资源数量超过配置限制；画布保持原内容"
      );
    resources.forEach((asset) => resourceAssets.current.set(asset.id, asset));
    setAssets((old) => [
      ...new Map([...old, ...resources].map((a) => [a.id, a])).values(),
    ]);
    setHierarchies((old) =>
      old.map((h) =>
        h.id === activeHierarchyId
          ? includeAssets(
              h,
              resources.filter((a) => !h.assetIds.includes(a.id)),
              null
            )
          : h
      )
    );
    const asset = resources[0];
    activatePanel(`canvas:${item.id}`);
    if (
      item.mode === "image" &&
      resources.length === 1 &&
      panelAssets[item.id] === asset.id &&
      !canvasLinks[item.id] &&
      panelRevisions.current[item.id] === (asset.revision ?? 0)
    )
      return;
    if (
      item.mode === "image" &&
      (panelAssets[item.id] || canvasLinks[item.id])
    ) {
      setReplacement({ windowId: item.id, asset });
      return;
    }
    if (
      item.mode !== "image" &&
      extensionDirty[item.id] &&
      !window.confirm("替换资源前，请确认已保存当前画布文档。继续打开？")
    )
      return;
    await openCanvasResources(item.id, resources.map(toResourceRef));
    setNotice(
      `已打开 ${resources.map((resource) => resource.name).join("、")}`
    );
  }

  function addCanvas(
    source?: WorkspaceWindow,
    readOnly = false,
    state?: unknown,
    properties?: import("../extensions/canvas/contracts").CanvasValues
  ) {
    if (
      (!readOnly &&
        windows.filter((w) => !w.readOnly).length >= settings.maxCanvasCount) ||
      windows.length >= 32
    ) {
      setNotice("已达到面板数量上限，请在文件 → 设置中调整");
      return;
    }
    let ordinal = windows.length + 1;
    while (windows.some((windowItem) => windowItem.title === `面板 ${ordinal}`))
      ordinal++;
    const item = {
      ...createWindow(ordinal - 1, source?.mode ?? "image"),
      readOnly,
    };
    if (properties) setCanvasPreferences(item.mode, { properties }, item.id);
    if (readOnly) item.title = `结果预览 ${ordinal}`;
    if (state !== undefined)
      localStorage.setItem(
        `assetflow.document.${item.mode}.${item.id}`,
        JSON.stringify(state)
      );
    const panel: DockPanelId = `canvas:${item.id}`;
    setWindows((old) => [...old, item]);
    setDock((old) =>
      insertDockPanel(
        old,
        panel,
        findActiveGroup(old, activePanel) ?? old.id,
        "center"
      )
    );
    if (!readOnly) setActiveCanvasId(item.id);
    setActivePanelState(panel);
    setNotice("");
  }

  function closePanel(panel: DockPanelId) {
    if (panel.startsWith("extension:")) { setDock(old => removeDockPanel(old, panel) ?? createDockNode("inspector")); if (activePanel === panel) setActivePanelState("inspector"); return; }
    if (!panel.startsWith("canvas:")) return;
    if (
      !windows.find((w) => w.id === panel.slice(7))?.readOnly &&
      windows.filter((w) => !w.readOnly).length <= 1
    ) {
      setNotice("至少保留一个编辑画布");
      return;
    }
    const id = panel.slice(7);
    if (
      extensionDirty[id] &&
      !window.confirm("此画布有未保存的修改，确定关闭并放弃修改？")
    )
      return;
    setCanvasLinks((old) =>
      Object.fromEntries(
        Object.entries(old).filter(
          ([target, source]) => target !== id && source !== id
        )
      )
    );
    const nextDock =
      removeDockPanel(dock, panel) ?? createDockNode("inspector");
    const nextWindows = windows.filter((item) => item.id !== id);
    setWindows(nextWindows);
    if (activePanel === panel || activeCanvasId === id) {
      const nextPanel = firstDockPanel(
        nextDock,
        (item) =>
          item.startsWith("canvas:") &&
          !nextWindows.find((w) => w.id === item.slice(7))?.readOnly
      );
      const nextCanvas = nextPanel?.slice(7) ?? nextWindows[0].id;
      const groupId = nextPanel ? findActiveGroup(nextDock, nextPanel) : null;
      setDock(
        groupId ? activateDockPanel(nextDock, groupId, nextPanel!) : nextDock
      );
      setActiveCanvasId(nextCanvas);
      setActivePanelState(`canvas:${nextCanvas}`);
    } else setDock(nextDock);
    setMenu(null);
  }

  function movePanel(
    panel: DockPanelId,
    target: string,
    zone: "center" | "left" | "right" | "top" | "bottom"
  ) {
    setDock((old) => moveDockPanel(old, panel, target, zone));
    setActivePanelState(panel);
    if (
      panel.startsWith("hierarchy:") &&
      activeHierarchyId !== panel.slice(10)
    ) {
      setActiveHierarchyId(panel.slice(10));
      setSelection([]);
    }
    if (
      panel.startsWith("canvas:") &&
      !windows.find((w) => w.id === panel.slice(7))?.readOnly
    )
      setActiveCanvasId(panel.slice(7));
  }

  function resizePanel(splitId: string, ratio: number) {
    setDock((old) => resizeDockSplit(old, splitId, ratio));
  }

  function addHierarchy(sourcePanel: DockPanelId) {
    let ordinal = 2;
    while (hierarchies.some((item) => item.title === `层级 ${ordinal}`))
      ordinal++;
    const item = createHierarchy(`层级 ${ordinal}`);
    setActiveHierarchyId(item.id);
    setSelection([]);
    const panel: DockPanelId = `hierarchy:${item.id}`;
    setHierarchies((old) => [...old, item]);
    setDock((old) =>
      insertDockPanel(
        old,
        panel,
        findActiveGroup(old, sourcePanel) ?? old.id,
        "center"
      )
    );
    setActivePanelState(panel);
    setNotice("");
    setMenu(null);
  }

  function closeHierarchy(panel: DockPanelId) {
    if (!panel.startsWith("hierarchy:") || hierarchies.length <= 1) return;
    const hierarchyId = panel.slice("hierarchy:".length);
    if (activeHierarchyId === hierarchyId) {
      setActiveHierarchyId(hierarchies.find((h) => h.id !== hierarchyId)!.id);
      setSelection([]);
    }
    const nextDock = removeDockPanel(dock, panel);
    if (!nextDock) return;
    setHierarchies((old) => old.filter((item) => item.id !== hierarchyId));
    if (activePanel === panel) {
      const nextPanel =
        firstDockPanel(
          nextDock,
          (item) => item.startsWith("hierarchy:") || item.startsWith("canvas:")
        ) ?? "inspector";
      const groupId = findActiveGroup(nextDock, nextPanel);
      setDock(
        groupId ? activateDockPanel(nextDock, groupId, nextPanel) : nextDock
      );
      setActivePanelState(nextPanel);
      if (nextPanel.startsWith("canvas:"))
        setActiveCanvasId(nextPanel.slice(7));
    } else setDock(nextDock);
    setMenu(null);
  }

  async function dropFilesIntoHierarchy(
    hierarchyId: string,
    files: File[],
    target: string | null = null
  ) {
    try {
      const paths = droppedFilePaths(files, window.assetFlow.filePath);
      const imported = await window.assetFlow.drop(paths, recursive);
      setAssets((old) => [
        ...old,
        ...imported.filter(
          (item) => !old.some((entry) => entry.id === item.id)
        ),
      ]);
      const importedAssets = new Map(
        [...assets, ...imported].map((item) => [
          normalizeAssetPath(item.path),
          item,
        ])
      );
      const droppedPaths = paths.map(normalizeAssetPath);
      const ids = [...importedAssets.values()]
        .filter((item) =>
          droppedPaths.some((path) => {
            const assetPath = normalizeAssetPath(item.path);
            return assetPath === path || assetPath.startsWith(`${path}/`);
          })
        )
        .map((item) => item.id);
      setHierarchies((old) =>
        old.map((h) =>
          h.id === hierarchyId
            ? includeAssets(
                h,
                [...importedAssets.values()].filter((a) => ids.includes(a.id)),
                target,
                true
              )
            : h
        )
      );
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function panelTitle(panel: DockPanelId) {
    if (panel.startsWith("extension:")) return systemExtensions.flatMap(record => record.config?.panels ?? []).find(item => item.id === panel.slice(10))?.name ?? "扩展面板";
    if (panel.startsWith("hierarchy:"))
      return (
        hierarchies.find((item) => `hierarchy:${item.id}` === panel)?.title ??
        "Hierarchy"
      );
    if (panel === "inspector") return "Inspector";
    const item = windows.find((item) => `canvas:${item.id}` === panel);
    return `${item?.title ?? "面板"}${
      item &&
      (extensionDirty[item.id] ||
        panelIsDirty(latestPanels.current[item.id], savedPanels[item.id]))
        ? " *"
        : ""
    }`;
  }

  function linkCanvas(source: string, target: string) {
    const from = windows.find((item) => item.id === source);
    const to = windows.find((item) => item.id === target);
    if (!from || !to || from.readOnly || to.readOnly || from.mode !== to.mode) {
      setNotice("请选择兼容类型的编辑画布");
      return;
    }
    setCanvasLinks((old) =>
      canLinkCanvas(old, source, target) ? { ...old, [target]: source } : old
    );
    if (canLinkCanvas(canvasLinks, source, target)) {
      invalidateCanvasBinding(target);
      const assetId = resolveCanvas(source,canvasLinks,panelAssets,documentsRef.current).assetId;
      panelRevisions.current[target] = assets.find(asset => asset.id === assetId)?.revision ?? 0;
    }
    if (canLinkCanvas(canvasLinks, source, target))
      setPanelAssets((old) => {
        const next = { ...old };
        delete next[target];
        return next;
      });
    if (!canLinkCanvas(canvasLinks, source, target))
      setNotice("不能关联自身或形成循环引用");
  }

  function setCanvasInput(value: string) {
    if (value.startsWith("canvas:")) {
      linkCanvas(value.slice(7), activeCanvasId);
      return;
    }
    const asset = assets.find((item) => `asset:${item.id}` === value);
    if (asset && activeWindow && acceptsAsset(activeWindow.mode, asset)) {
      void action(() => openAssetsOnCanvas(activeWindow, [asset]));
      return;
    }
    if (!value) {
      invalidateCanvasBinding(activeCanvasId);
      setCanvasLinks((old) => {
        const next = { ...old };
        delete next[activeCanvasId];
        return next;
      });
      setPanelAssets((old) => {
        const next = { ...old };
        delete next[activeCanvasId];
        return next;
      });
    }
  }

  function renderPanel(panel: DockPanelId) {
    if (panel.startsWith("extension:")) return <ExtensionPanelView key={panel} panelId={panel.slice(10)} host="dock" />;
    if (panel.startsWith("hierarchy:")) {
      const hierarchyId = panel.slice("hierarchy:".length);
      const hierarchy = hierarchies.find((item) => item.id === hierarchyId);
      if (!hierarchy) return null;
      return (
        <HierarchyPanel
          hierarchy={hierarchy}
          assets={assets}
          selection={hierarchyId === activeHierarchyId ? selection : []}
          onSelection={(ids) => {
            setActiveHierarchyId(hierarchyId);
            setSelection(ids);
          }}
          onChange={(next) =>
            setHierarchies((old) =>
              old.map((h) => (h.id === hierarchyId ? next : h))
            )
          }
          onDropFiles={(files, folder) =>
            void dropFilesIntoHierarchy(hierarchyId, files, folder)
          }
          icons={icons}
          onOpen={(asset) => {
            if (activeWindow)
              void action(() => openAssetsOnCanvas(activeWindow, [asset]));
          }}
        />
      );
    }
    if (panel === "inspector") {
      const connections = activeWindow && !activeWindow.readOnly && (
        <>
          {" "}
          <CanvasConnections
            input={
              canvasLinks[activeCanvasId]
                ? `canvas:${canvasLinks[activeCanvasId]}`
                : panelAssets[activeCanvasId]
                ? `asset:${panelAssets[activeCanvasId]}`
                : ""
            }
            inputs={[
              ...assets
                .filter((asset) => acceptsAsset(activeWindow.mode, asset))
                .map((asset) => ({
                  value: `asset:${asset.id}`,
                  label: `资源 · ${asset.name}`,
                })),
              ...windows
                .filter(
                  (item) =>
                    !item.readOnly &&
                    item.mode === activeWindow.mode &&
                    item.id !== activeCanvasId &&
                    canLinkCanvas(canvasLinks, item.id, activeCanvasId)
                )
                .map((item) => ({
                  value: `canvas:${item.id}`,
                  label: `画布 · ${item.title}`,
                })),
            ]}
            outputs={Object.keys(canvasLinks).filter(
              (id) => canvasLinks[id] === activeCanvasId
            )}
            targets={windows
              .filter(
                (item) =>
                  !item.readOnly &&
                  item.mode === activeWindow.mode &&
                  item.id !== activeCanvasId &&
                  canLinkCanvas(canvasLinks, activeCanvasId, item.id)
              )
              .map((item) => ({ value: item.id, label: item.title }))}
            onInput={setCanvasInput}
            onOutputs={(ids) => {
              setCanvasLinks((old) =>
                Object.fromEntries(
                  Object.entries(old).filter(
                    ([target, source]) =>
                      source !== activeCanvasId || ids.includes(target)
                  )
                )
              );
              ids.forEach((id) => linkCanvas(activeCanvasId, id));
            }}
            onDrop={(event) => {
              const panel = event.dataTransfer.getData(
                "application/assetflow-dock"
              );
              if (panel.startsWith("canvas:")) {
                event.preventDefault();
                event.stopPropagation();
                setCanvasInput(panel);
              } else void dropOnPanel(event, activeWindow);
            }}
          />{" "}
          <CanvasBaseProperties
            type={activeWindow.mode}
            windowId={activeCanvasId}
          />{" "}
        </>
      );
      if (activeWindow && activeWindow.mode !== "image")
        return (
          <ExtensionInspector
            key={`${activeCanvasId}:${activeWindow.mode}`}
            windowId={activeCanvasId}
            type={activeWindow.mode}
            connections={connections}
          />
        );
      return (
        <Inspector
          connections={connections}
          saved={savedPanels[activeCanvasId]}
          showHistory={!!historyPanels[activeCanvasId]}
          onShowHistory={() =>
            setHistoryPanels((old) => ({
              ...old,
              [activeCanvasId]: !old[activeCanvasId],
            }))
          }
          title={
            activeWindow
              ? `${activeWindow.title} · ${activeWindow.mode}`
              : "未选定面板"
          }
          document={
            activeWindow?.mode === "image" && !activeWindow.readOnly
              ? documents[activeCanvasId] ?? EMPTY_DOCUMENT
              : undefined
          }
          setDocument={(update) => {
            if (activeCanvasId)
              setDocuments((old) => ({
                ...old,
                [activeCanvasId]:
                  typeof update === "function"
                    ? update(old[activeCanvasId] ?? emptyDocument())
                    : update,
              }));
          }}
        />
      );
    }
    const item = windows.find((entry) => `canvas:${entry.id}` === panel);
    if (!item) return null;
    if (item.readOnly)
      return (
        <ResultPanel
          asset={
            savedPanels[activeCanvasId]?.mode === "image"
              ? assets.find(
                  (a) => a.path === savedPanels[activeCanvasId]?.sourcePath
                )
              : undefined
          }
          steps={savedPanels[activeCanvasId]?.steps ?? EMPTY_DOCUMENT.steps}
          source={activeWindow?.title ?? "未选定面板"}
          windowId={item.id}
        />
      );
    return (
      <div
        className="generic-panel"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/assetflow-dock"))
            return;
          const incomingId = event.dataTransfer.getData(
            "application/assetflow-asset"
          );
          const incoming = assets.find((asset) => asset.id === incomingId);
          const allowed =
            hasCanvasResourceOpener(item.id) &&
            !!configFor(item.mode)?.resources?.length &&
            (!incoming || acceptsAsset(item.mode, incoming));
          event.dataTransfer.dropEffect = allowed ? "copy" : "none";
          if (allowed) event.preventDefault();
        }}
        onDrop={(event) => void dropOnPanel(event, item)}
      >
        <PanelToolbar
          windowId={item.id}
          isActive={activeCanvasId === item.id}
          type={item.mode}
          onTypeChange={(mode) => {
            if (
              mode !== item.mode &&
              extensionDirty[item.id] &&
              !window.confirm("此画布有未保存的修改，确定切换类型？")
            )
              return;
            if (mode !== item.mode) invalidateCanvasBinding(item.id);
            if (mode !== item.mode)
              setCanvasResources((old) => {
                const next = { ...old };
                delete next[item.id];
                return next;
              });
            if (mode !== item.mode)
              setPanelAssets((old) => {
                const next = { ...old };
                delete next[item.id];
                return next;
              });
            if (mode !== item.mode)
              setCanvasLinks((old) =>
                Object.fromEntries(
                  Object.entries(old).filter(
                    ([target, source]) =>
                      target !== item.id && source !== item.id
                  )
                )
              );
            setWindows((old) =>
              old.map((w) => (w.id === item.id ? { ...w, mode } : w))
            );
          }}
        />
        <div className="canvas-surface">
          <CanvasToolbox key={item.mode} windowId={item.id} type={item.mode} />
          {item.mode !== "image" ? (
            <div className="empty">
              {configFor(item.mode) ? (
                <ExtensionCanvas
                  resources={canvasResources[item.id] ?? EMPTY_RESOURCES}
                  onResources={(resources) => {
                    invalidateCanvasBinding(item.id);
                    const asset = assets.find(asset => asset.id === resources[0]?.id);
                    panelRevisions.current[item.id] = asset?.revision ?? 0;
                    if (asset) setSavedPanels(old => ({ ...old, [item.id]: { version: 1, sourcePath: asset.path, mode: item.mode, steps: [], canvasProperties: getCanvasPreferences(item.mode,item.id).properties } }));
                    setExtensionDirty(old => ({ ...old, [item.id]: false }));
                    setCanvasResources((old) => ({
                      ...old,
                      [item.id]: resources,
                    }));
                    setPanelAssets((old) => ({
                      ...old,
                      [item.id]: resources[0]?.id ?? "",
                    }));
                    setCanvasLinks((old) => {
                      const next = { ...old };
                      delete next[item.id];
                      return next;
                    });
                  }}
                  linked={Object.values(canvasLinks).includes(item.id)}
                  key={`${item.id}:${item.mode}`}
                  windowId={item.id}
                  type={item.mode}
                  input={
                    canvasLinks[item.id]
                      ? extensionOutputs[canvasLinks[item.id]]
                      : panelAssets[item.id]
                      ? { assetId: panelAssets[item.id] }
                      : null
                  }
                  onOutput={(value) =>
                    setExtensionOutputs((old) => ({ ...old, [item.id]: value }))
                  }
                  onNotice={setNotice}
                  onActivate={() => {
                    setActiveCanvasId(item.id);
                    setActivePanelState(`canvas:${item.id}`);
                  }}
                  onState={() => {
                    extensionVersions.current[item.id] = (extensionVersions.current[item.id] ?? 0) + 1;
                    setExtensionDirty((old) => ({ ...old, [item.id]: true }));
                  }}
                />
              ) : (
                <p>
                  {item.mode} 编辑器未安装或尚未启用，资源可在层级中整理和导出
                </p>
              )}
            </div>
          ) : (
            <ImageWorkspace
              key={item.id}
              displayInput={Object.values(canvasLinks).includes(item.id)}
              windowId={item.id}
              isActive={activePanel === panel}
              assets={assets.filter((a) =>
                /^(png|jpeg|jpg|webp)$/i.test(a.format)
              )}
              setAssets={setAssets}
              selectedAssetId={
                resolveCanvas(item.id, canvasLinks, panelAssets, documents)
                  .assetId
              }
              inheritedSteps={
                canvasLinks[item.id]
                  ? resolvePreviewCanvas(
                      canvasLinks[item.id],
                      canvasLinks,
                      panelAssets,
                      documents
                    ).steps
                  : EMPTY_DOCUMENT.steps
              }
              document={documents[item.id] ?? EMPTY_DOCUMENT}
              setDocument={(update) =>
                setDocuments((old) => ({
                  ...old,
                  [item.id]:
                    typeof update === "function"
                      ? update(old[item.id] ?? emptyDocument())
                      : update,
                }))
              }
              workspaceState={canvasStates[item.id] ?? defaultCanvasState()}
              setWorkspaceState={(update) =>
                setCanvasStates((old) => ({
                  ...old,
                  [item.id]:
                    typeof update === "function"
                      ? update(old[item.id] ?? defaultCanvasState())
                      : update,
                }))
              }
            />
          )}
        </div>
      </div>
    );
  }

  async function action(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }
  async function importToHierarchy(folder: boolean) {
    await action(async () => {
      const items = await window.assetFlow.importFiles(folder, true);
      setAssets((old) => [
        ...new Map([...old, ...items].map((a) => [a.id, a])).values(),
      ]);
      setHierarchies((old) =>
        old.map((h) =>
          h.id === activeHierarchyId ? includeAssets(h, items, null, folder) : h
        )
      );
    });
  }

  function onPanelContext(panel: DockPanelId, x: number, y: number) {
    setMenu({ panel, x: Math.min(x, innerWidth - 190), y });
  }

  return (
    <div className="app dock-app">
      <ToolSwitchDialog />
      <SystemExtensionRuntimes />
      {systemDialog && <div className="settings-backdrop"><section className="settings-dialog extension-panel-dialog" role="dialog" aria-label="扩展面板"><header><strong>{systemExtensions.flatMap(record => record.config?.panels ?? []).find(panel => panel.id === systemDialog)?.name}</strong><button aria-label="关闭扩展面板" onClick={() => setSystemDialog("")}>×</button></header><ExtensionPanelView key={systemDialog} panelId={systemDialog} host="dialog" /></section></div>}
      <ApplicationNavigation commands={{
"system.modules.canvas": () => setModuleManagerOpen(true),
"system.file.openResource": () =>
                      void action(async () => {
                        if (
                          !activeWindow ||
                          !hasCanvasResourceOpener(activeWindow.id)
                        )
                          throw Error("请先选择已配置资源入口的画布");
                        const resources = await window.assetFlow.importFiles(
                          false,
                          false
                        );
                        if (resources.length)
                          await openAssetsOnCanvas(activeWindow, resources);
                      }),
"system.file.saveImage": openImageOutput,
"system.file.savePanel": () => void action(() => savePanel(activeCanvasId)),
"system.file.openDocument": () =>
                      void action(async () => {
                        const saved =
                          await window.assetFlow.canvasModules.loadDocument();
                        if (!saved) return;
                        const config = configFor(saved.type);
                        if (!config)
                          throw Error("请先在模块管理器中启用对应画布类型");
                        if (config.version !== saved.moduleVersion)
                          throw Error(
                            "画布文档的模块版本不匹配，请使用原版本模块"
                          );
                        addCanvas(
                          createWindow(0, saved.type),
                          false,
                          saved.state,
                          saved.canvasProperties
                        );
                      }),
"system.file.openPanel": () => void action(openPanel),
"system.file.saveWorkspace": () =>
                      void action(() =>
                        window.assetFlow.saveWorkspace({ hierarchies })
                      ),
"system.file.openWorkspace": () =>
                      void action(async () => {
                        const saved = await window.assetFlow.loadWorkspace();
                        if (!saved) return;
                        const loaded = saved.data.hierarchies as Hierarchy[];
                        if (!loaded.length) throw Error("工作区没有层级");
                        setAssets(saved.assets);
                        setHierarchies(loaded);
                        setActiveHierarchyId(loaded[0].id);
                        setSelection([]);
                        let tree = dock;
                        for (const h of hierarchies)
                          tree =
                            removeDockPanel(tree, `hierarchy:${h.id}`) ??
                            createDockNode("inspector");
                        for (const h of loaded)
                          tree = insertDockPanel(
                            tree,
                            `hierarchy:${h.id}`,
                            tree.id,
                            "left"
                          );
                        setDock(tree);
                      }),
"system.file.import": () => setImportOpen(true),
"system.file.importFiles": () => void importToHierarchy(false),
"system.file.importFolder": () => void importToHierarchy(true),
"system.file.exportImage": openImageOutput,
"system.file.exportAll": () => setExportScope("all"),
"system.file.exportSelected": () => setExportScope("selected"),
"system.settings.open": () => {
                  setSystemSettingsPanel("");
                  setSettingsTarget({ type: "", section: "settings" });
                  setSettingsOpen(true);
                },
"system.edit.newPanel": () => addCanvas(),
"system.edit.preview": () => addCanvas(activeWindow, true)
}} canvases={types.map(type => ({ id: `system.canvas.${type.id}`, label: type.label, action: () => addCanvas({ ...createWindow(0, type.id) }) }))} />
      {imageOutput && (
        <ImageOutputDialog
          assetId={imageOutput.assetId}
          steps={imageOutput.steps}
          onClose={() => setImageOutput(undefined)}
          onDone={() => {
            setImageOutput(undefined);
            setNotice("图片导出完成");
          }}
        />
      )}
      {importOpen && <div className="settings-backdrop"><section className="settings-dialog" role="dialog" aria-label="导入资源"><h3>导入资源</h3><p>将文件复制到内部资产区，编辑不会改变源文件。</p><button onClick={() => { setImportOpen(false); void importToHierarchy(false); }}>选择文件…</button><button onClick={() => { setImportOpen(false); void importToHierarchy(true); }}>选择文件夹…</button><button onClick={() => setImportOpen(false)}>取消</button></section></div>}
      {exportScope && <ExportSelectionDialog hierarchy={hierarchies.find(h => h.id === activeHierarchyId)!} assets={assets} busy={exportBusy} onClose={() => setExportScope(null)} onExport={async (selected, name, zip, imageOptions) => {
        setExportBusy(true);
        try {
          const h = hierarchies.find(h => h.id === activeHierarchyId)!;
          const ids = collectAssets(h, selected);
          const dirty = windows.filter(item => !item.readOnly && ids.includes(resolveCanvas(item.id, canvasLinks, panelAssets, documentsRef.current).assetId ?? "") && (extensionDirty[item.id] || canvasInspectorDirty(item.id) || imageDraftChanged(documentsRef.current[item.id] ?? emptyDocument()) || panelIsDirty(latestPanels.current[item.id], savedPanels[item.id])));
          const byAsset = new Map<string, WorkspaceWindow[]>();
          for (const canvas of dirty) {
            const id = resolveCanvas(canvas.id, canvasLinks, panelAssets, documentsRef.current).assetId!;
            byAsset.set(id, [...(byAsset.get(id) ?? []), canvas]);
          }
          if (dirty.length) {
            const approved = await new Promise<string[]|null>(resolve => setExportApproval({ groups: [...byAsset.entries()].map(([id,canvases]) => ({ name: assets.find(asset => asset.id === id)?.name ?? "资产", canvases, selected: canvases.find(canvas => canvas.id === activeCanvasId)?.id ?? canvases[canvases.length - 1].id })), resolve }));
            if (!approved) return;
            for (const id of approved) if (!await savePanel(id)) throw Error("资产尚未保存，已停止导出");
          }
          const output = await window.assetFlow.exportHierarchy(ids.map(id => ({ id, folder: folderPath(h,h.locations[id] ?? null) })), collectFolders(h,selected),name,zip,imageOptions);
          if (output) { setNotice(`已导出到 ${output}`); setExportScope(null); }
        } finally { setExportBusy(false); }
      }} />}
      {exportApproval && <div className="settings-backdrop"><section className="settings-dialog" role="dialog" aria-label="保存后导出"><h3>所选资产有未保存的修改</h3><p>是否保存以下画布后导出？同一资产只保存所选画布，其他画布的修改仍保留。</p>{exportApproval.groups.map((group,index) => <label className="field" key={index}><span>{group.name}</span>{group.canvases.length === 1 ? <span>{group.canvases[0].title}</span> : <select aria-label={`${group.name}的保存画布`} value={group.selected} onChange={event => setExportApproval(old => old && ({ ...old, groups: old.groups.map((item,i) => i === index ? { ...item, selected: event.target.value } : item) }))}>{group.canvases.map(canvas => <option key={canvas.id} value={canvas.id}>{canvas.title}</option>)}</select>}</label>)}<button onClick={() => { exportApproval.resolve(exportApproval.groups.map(group => group.selected)); setExportApproval(undefined); }}>保存并导出</button><button onClick={() => { exportApproval.resolve(null); setExportApproval(undefined); }}>取消</button></section></div>}
      {replacement && (
        <ReplacePanelDialog
          name={replacement.asset.name}
          busy={savingReplacement}
          onCancel={() => setReplacement(null)}
          onReplace={() => {
            void action(async () => {
              await openCanvasResources(replacement.windowId, [
                toResourceRef(replacement.asset),
              ]);
              setReplacement(null);
            });
          }}
          onSave={() =>
            void action(async () => {
              setSavingReplacement(true);
              try {
                if (await savePanel(replacement.windowId)) {
                  await openCanvasResources(replacement.windowId, [
                    toResourceRef(replacement.asset),
                  ]);
                  setReplacement(null);
                }
              } finally {
                setSavingReplacement(false);
              }
            })
          }
        />
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <DockLayout
        node={dock}
        activePanel={
          activePanel === "inspector" ? `canvas:${activeCanvasId}` : activePanel
        }
        setActivePanel={activatePanel}
        renderPanel={renderPanel}
        onMove={movePanel}
        onClose={closePanel}
        onContextMenu={onPanelContext}
        panelTitle={panelTitle}
        onResize={resizePanel}
      />
      {progress && (
        <div className="dock-task-status">
          任务：{progress.finished ? "已完成" : "执行中"} · {progress.done}/
          {progress.total} · 成功 {progress.success} · 失败 {progress.failed}
          {!progress.finished && (
            <button onClick={() => void window.assetFlow.cancel()}>取消</button>
          )}
        </div>
      )}
      {menu && (
        <div
          className="workspace-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.panel.startsWith("hierarchy:") && (
            <>
              <button onClick={() => addHierarchy(menu.panel)}>新建层级</button>
              {hierarchies.length > 1 && (
                <button onClick={() => closeHierarchy(menu.panel)}>
                  移除此层级
                </button>
              )}
            </>
          )}
          {menu.panel.startsWith("canvas:") && (
            <>
              <button
                onClick={() =>
                  addCanvas(
                    windows.find((item) => item.id === menu.panel.slice(7))
                  )
                }
              >
                创建同类面板
              </button>
              <button onClick={() => closePanel(menu.panel)}>移除此面板</button>
            </>
          )}
        </div>
      )}
      {moduleManagerOpen && (
        <ModuleManager
          usedTypes={windows.map((w) => w.mode)}
          onClose={() => setModuleManagerOpen(false)}
        />
      )}
      {settingsOpen && (
        <CanvasSettings
          key={`${systemSettingsPanel}:${systemSettingsRequest}`}
          extensionPanel={systemSettingsPanel}
          windowId={settingsTarget.windowId}
          initialType={settingsTarget.type}
          initialSection={settingsTarget.section}
          onClose={() => setSettingsOpen(false)}
        >
          <label>
            编辑面板最大数量
            <input
              type="number"
              min="1"
              max="16"
              value={settings.maxCanvasCount}
              onChange={(event) => {
                const value = Number(event.target.value);
                const error = validateWindowLimit(
                  value,
                  windows.filter((w) => !w.readOnly).length
                );
                if (error) setNotice(error);
                else setSettings({ ...settings, maxCanvasCount: value });
              }}
            />
          </label>
          <p>Hierarchy 可创建多个实例；Inspector 固定一个实例。</p>
          {assetTypes.map((type) => (
            <label key={type.id}>
              {type.label}图标
              <input
                aria-label={`${type.label}图标`}
                maxLength={4}
                value={icons[type.id] ?? type.icon}
                onChange={(e) =>
                  setIcons((old) => ({ ...old, [type.id]: e.target.value }))
                }
              />
            </label>
          ))}
        </CanvasSettings>
      )}
    </div>
  );
}

function emptyDocument(): ImageDocument {
  return {
    steps: [],
    activeStepId: "",
    editing: null,
    viewport: { scale: 1, panX: 0, panY: 0, locked: true },
  };
}
const EMPTY_DOCUMENT = emptyDocument();
const EMPTY_RESOURCES: readonly CanvasResourceRef[] = [];
function defaultCanvasState(): ImageWorkspaceState {
  return {
    recursive: true,
    running: false,
    outputDirectory: "",
    preserve: true,
    zip: false,
  };
}
function findActiveGroup(node: DockNode, panel: DockPanelId): string | null {
  if (node.kind === "tabs") return node.panels.includes(panel) ? node.id : null;
  return (
    findActiveGroup(node.first, panel) ?? findActiveGroup(node.second, panel)
  );
}
function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
}
