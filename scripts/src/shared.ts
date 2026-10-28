export type { Field, Definition, Step } from "./core/framework/contracts";
import type { Definition, Step } from "./core/framework/contracts";
export type ImageExportOptions = { format: string; quality: number; template: string; background: string };
export type Asset = {
  id: string;
  path: string;
  sourcePath?: string;
  savedPath?: string;
  savedSteps?: Step[];
  revision?: number;
  root: string;
  name: string;
  width: number;
  height: number;
  format: string;
  size: number;
  thumbnail: string;
  error?: string;
};
export type Progress = {
  done: number;
  total: number;
  success: number;
  failed: number;
  cancelled: boolean;
  current: string;
  errors: string[];
  finished?: boolean;
};
export type Output = { directory: string; preserve: boolean; zip: boolean };
export type PanelSnapshot = {
  version: 1;
  sourcePath: string;
  mode: string;
  steps: Step[];
  canvasProperties?: import("./extensions/canvas/contracts").CanvasValues;
};
export interface Bridge {
  atlas: {
    read(id: string): Promise<ArrayBuffer>;
    export(png: ArrayBuffer, metadata: string, name: string): Promise<boolean>;
  };
  importRules: {
    get(): Promise<import("./shared/filePatterns").ImportRules>;
    save(rules: import("./shared/filePatterns").ImportRules): Promise<void>;
  };
  workspace?: {
    saveBytes(id: string, data: ArrayBuffer, name: string | undefined, revision: number): Promise<Asset>;
    saveImage(id: string, steps: Step[], revision: number): Promise<Asset>;
  };
    systemExtensions?: {
      mount(id: string): Promise<string>;
      unmount(url: string): Promise<void>;
      snapshot(): Promise<import("../extensions/sdk/contracts").SystemExtensionRecord[]>;
      values(panel: string): Promise<import("./extensions/canvas/contracts").CanvasValues>;
      saveValues(panel: string, values: unknown): Promise<import("./extensions/canvas/contracts").CanvasValues>;
    };
  canvasModules: {
    authorizeResources(
      session: string,
      ids: string[]
    ): Promise<import("./extensions/canvas/contracts").CanvasResourceRef[]>;
    readResource(session: string, id: string): Promise<ArrayBuffer>;
    list(): Promise<import("./extensions/canvas/contracts").CanvasModuleRecord[]>;
    install(): Promise<import("./extensions/canvas/contracts").CanvasModuleRecord[]>;
    change(
        action: "enable" | "disable" | "reload" | "uninstall" | "uninstall-files",
      id: string
    ): Promise<import("./extensions/canvas/contracts").CanvasModuleRecord[]>;
    payload(id: string): Promise<import("./extensions/canvas/contracts").ModulePayload>;
    mount(
      id: string,
      boot: {
        windowId: string;
        settings: import("./extensions/canvas/contracts").CanvasValues;
        state: unknown;
        previewTarget?: "self" | "linked";
        canvasProperties?: import("./extensions/canvas/contracts").CanvasValues;
      }
    ): Promise<string>;
    unmount(url: string): Promise<void>;
    saveDocument(
      document: import("./extensions/canvas/contracts").CanvasDocument
    ): Promise<boolean>;
    loadDocument(): Promise<import("./extensions/canvas/contracts").CanvasDocument | null>;
  };
  savePanel(windowId: string, snapshot: PanelSnapshot): Promise<boolean>;
  loadPanel(): Promise<{ snapshot: PanelSnapshot; asset: Asset } | null>;
  exportHierarchy(
    entries: { id: string; folder: string }[],
    folders: string[],
    name: string,
    zip?: boolean,
    imageOptions?: ImageExportOptions
  ): Promise<string>;
  saveWorkspace(data: unknown): Promise<void>;
  loadWorkspace(): Promise<{ data: any; assets: Asset[] } | null>;
  definitions(): Promise<Definition[]>;
  importFiles(folder: boolean, recursive: boolean): Promise<Asset[]>;
  drop(paths: string[], recursive: boolean): Promise<Asset[]>;
  filePath(file: File): string;
  remove(id: string): Promise<void>;
  preview(
    id: string,
    steps: Step[],
    index?: number,
    purpose?: "original" | "processed",
    windowId?: string
  ): Promise<{
    url: string;
    width: number;
    height: number;
    format: string;
    name: string;
    warnings: string[];
  }>;
  chooseOutput(): Promise<string>;
  run(ids: string[], steps: Step[], output: Output): Promise<void>;
  cancel(): Promise<void>;
  savePreset(steps: Step[]): Promise<void>;
  loadPreset(): Promise<Step[] | null>;
  onProgress(fn: (p: Progress) => void): () => void;
}
declare global {
  interface Window {
    assetFlow: Bridge;
  }
}
