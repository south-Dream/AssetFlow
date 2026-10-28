// Authoring SDK. Bundle any runtime imports into your browser ESM entry.
export { bindInspectorModel } from "./inspectorAdapter";

export { CanvasBase, NavNode, ToolNode, defineCanvasModule } from "./module";
export type { CanvasContext, CanvasBindings, CanvasModuleDefinition, InspectorDrawContext } from "./module";
export type {
  CanvasIdentity,
  CanvasConfig,
  CanvasTool,
  CanvasMenu,
  ConfigField,
  CanvasValues,
  CanvasDocument,
  CanvasResourceRef,
  CanvasResourceRule,
  CanvasResourceHandler,
  CanvasResourceAPI,
  CanvasAcceptResult,
  InspectorAdapter,
  FieldDrawContext,
  InspectorUI,
} from "./contracts";
