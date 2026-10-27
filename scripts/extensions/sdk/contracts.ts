import type { ConfigField, CanvasValues } from "../canvas_moudles/sdk/contracts";
export type PanelHost = "dialog" | "settings" | "dock";
export type NavigationAction = { type: "openPanel"; panel: string; host?: PanelHost };
export type NavNode = {
  id: string; name: string; order?: number;
  command?: string; action?: NavigationAction; children?: NavNode[];
};
/** Contribution target is registration metadata, never drawing placement. */
export type NavigationItem = NavNode & { parent?: string };
export type NavigationRegions = Record<string, string[]>;
export type NavigationLayout = { regions: NavigationRegions; order?: string[] };
export type NavigationContainerDefinition = { root: NavNode; regions: NavigationRegions; order: string[] };
export abstract class NavigationContainerBase {
  abstract build(nodes: readonly NavNode[], layout?: NavigationLayout): NavigationContainerDefinition;
}
export type ExtensionPanelConfig = {
  id: string; name: string; renderer: "form" | "custom"; fields: ConfigField[];
};
export type SystemExtensionConfig = {
  id: string; name: string; desc: string; schemaVersion: 1; sdkVersion: 1;
  entry?: string; menus: NavigationItem[]; panels: ExtensionPanelConfig[];
  navigation?: NavigationLayout;
  settingsPages: { id: string; name: string; panel: string }[];
};
export type SystemExtensionRecord = { folder: string; config?: SystemExtensionConfig; source: string; error?: string };
export interface PanelContext {
  readonly root: HTMLElement;
  readonly panelId: string;
  readonly host: PanelHost;
  readonly values: Readonly<CanvasValues>;
  setValues(values: CanvasValues): Promise<void>;
  onDispose(cleanup: () => void): void;
}
export interface ExtensionPanel {
  mount(context: PanelContext): void | Promise<void>;
  unmount?(): void | Promise<void>;
}
export abstract class ExtensionPanelBase implements ExtensionPanel {
  abstract mount(context: PanelContext): void | Promise<void>;
  unmount(): void | Promise<void> {}
}
export interface SystemExtensionContext {
  getValues(panelId: string): Promise<CanvasValues>;
  setValues(panelId: string, values: CanvasValues): Promise<CanvasValues>;
  onValues(panelId: string, handler: (values: CanvasValues) => void): () => void;
  registerCommand(id: string, handler: () => void | Promise<void>): void;
  registerPanel(id: string, panel: ExtensionPanel): void;
  openPanel(id: string, host?: PanelHost): void;
  notify(message: string): void;
}
export interface SystemExtensionModule {
  activate(context: SystemExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
