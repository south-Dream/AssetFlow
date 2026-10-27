import { contextBridge, ipcRenderer, webUtils } from "electron";
contextBridge.exposeInMainWorld("assetFlow", {
  workspace: { saveBytes: (id: string, data: ArrayBuffer, name: string|undefined, revision: number) => ipcRenderer.invoke("workspace.saveBytes", id, data, name, revision), saveImage: (id: string, steps: unknown, revision: number) => ipcRenderer.invoke("workspace.saveImage", id, steps, revision) },
  systemExtensions: {
    mount: (id: string) => ipcRenderer.invoke("systemExtensions.mount", id),
    unmount: (url: string) => ipcRenderer.invoke("systemExtensions.unmount", url),
    snapshot: () => ipcRenderer.invoke("systemExtensions.snapshot"),
    values: (panel: string) => ipcRenderer.invoke("systemExtensions.values", panel),
    saveValues: (panel: string, values: unknown) => ipcRenderer.invoke("systemExtensions.saveValues", panel, values),
  },
  canvasModules: {
    authorizeResources: (session: string, ids: string[]) =>
      ipcRenderer.invoke("canvasModules.authorizeResources", session, ids),
    readResource: (session: string, id: string) =>
      ipcRenderer.invoke("canvasModules.readResource", session, id),
    list: () => ipcRenderer.invoke("canvasModules.list"),
    install: () => ipcRenderer.invoke("canvasModules.install"),
    change: (action: string, id: string) =>
      ipcRenderer.invoke("canvasModules.change", action, id),
    payload: (id: string) => ipcRenderer.invoke("canvasModules.payload", id),
    mount: (id: string, boot: unknown) =>
      ipcRenderer.invoke("canvasModules.mount", id, boot),
    unmount: (url: string) => ipcRenderer.invoke("canvasModules.unmount", url),
    saveDocument: (document: unknown) =>
      ipcRenderer.invoke("canvasModules.saveDocument", document),
    loadDocument: () => ipcRenderer.invoke("canvasModules.loadDocument"),
  },
  savePanel: (windowId: string, snapshot: unknown) =>
    ipcRenderer.invoke("savePanel", windowId, snapshot),
  loadPanel: () => ipcRenderer.invoke("loadPanel"),
  exportHierarchy: (entries: unknown, folders: string[], name: string, zip = false, imageOptions?: unknown) =>
    ipcRenderer.invoke("exportHierarchy", entries, folders, name, zip, imageOptions),
  saveWorkspace: (data: unknown) => ipcRenderer.invoke("saveWorkspace", data),
  loadWorkspace: () => ipcRenderer.invoke("loadWorkspace"),
  definitions: () => ipcRenderer.invoke("definitions"),
  importFiles: (folder: boolean, recursive: boolean) =>
    ipcRenderer.invoke("import", folder, recursive),
  drop: (paths: string[], recursive: boolean) =>
    ipcRenderer.invoke("drop", paths, recursive),
  filePath: (file: File) => webUtils.getPathForFile(file),
  remove: (id: string) => ipcRenderer.invoke("remove", id),
  preview: (
    id: string,
    steps: unknown,
    index = 0,
    purpose = "processed",
    windowId?: string
  ) => ipcRenderer.invoke("preview", id, steps, index, purpose, windowId),
  chooseOutput: () => ipcRenderer.invoke("output"),
  run: (ids: string[], steps: unknown, output: unknown) =>
    ipcRenderer.invoke("run", ids, steps, output),
  cancel: () => ipcRenderer.invoke("cancel"),
  savePreset: (steps: unknown) => ipcRenderer.invoke("savePreset", steps),
  loadPreset: () => ipcRenderer.invoke("loadPreset"),
  onProgress: (fn: Function) => {
    const listener = (_: unknown, p: unknown) => fn(p);
    ipcRenderer.on("progress", listener);
    return () => ipcRenderer.removeListener("progress", listener);
  },
});
