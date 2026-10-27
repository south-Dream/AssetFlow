import type { SystemExtensionConfig } from "../../../extensions/sdk/contracts";
import { validateNavigation, composeNavigation, validateNavigationLayout } from "../navigation";
import { validateCanvasConfig } from "../canvas/config";
import builtin from "../../../extensions/builtin/navigation.json";
export const builtinNavigation = builtin;
export function validateSystemConfig(input: any): SystemExtensionConfig {
  if (!input || !/^[a-z][a-z0-9_-]{0,63}$/.test(input.id) || input.id === "system" || input.schemaVersion !== 1 || input.sdkVersion !== 1) throw Error("无效系统扩展 ID 或版本");
  const scoped = (id: any) => typeof id === "string" && id.startsWith(input.id + ".") && /^[a-zA-Z0-9_.-]+$/.test(id);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200 || (input.desc !== undefined && typeof input.desc !== "string")) throw Error("无效扩展名称或描述");
  const menus = validateNavigation(input.menus, input.id);
  const composed = composeNavigation(builtin, menus);
  const navigation = validateNavigationLayout(input.navigation, composed.filter(item => item.id.startsWith(input.id + ".")).map(item => item.id));
  const ids = new Set<string>();
  const list = (items: any) => { if (items === undefined) return []; if (!Array.isArray(items) || items.length > 100) throw Error("扩展列表无效"); return items; };
  const panels = list(input.panels).map((panel: any) => {
    if (!panel || !scoped(panel.id) || ids.has(panel.id) || typeof panel.name !== "string" || !panel.name.trim() || !["form", "custom"].includes(panel.renderer)) throw Error("无效或重复面板");
    ids.add(panel.id);
    const fields = validateCanvasConfig({ id: input.id, name: input.name, desc: "", version: "1", schemaVersion: 1, sdkVersion: 1, settings: panel.fields ?? [] }).settings;
    return { id: panel.id, name: panel.name, renderer: panel.renderer, fields };
  });
  const settingsPages = list(input.settingsPages).map((page: any) => {
    if (!page || !scoped(page.id) || ids.has(page.id) || typeof page.name !== "string" || !page.name.trim() || !panels.some((panel: any) => panel.id === page.panel)) throw Error("无效设置页面");
    ids.add(page.id); return { id: page.id, name: page.name, panel: page.panel };
  });
  const walk = (items: typeof menus) => items.forEach(item => { if (item.action && !panels.some((panel: any) => panel.id === item.action!.panel)) throw Error("导航引用未知面板"); if (item.children) walk(item.children); }); walk(menus);
  const needsScript = panels.some((p: any) => p.renderer === "custom") || JSON.stringify(menus).includes('"command":');
  if (needsScript && !input.entry) throw Error("命令和自定义面板需要 entry");
  if (input.entry !== undefined && (typeof input.entry !== "string" || input.entry.startsWith("/") || !/^(?:\.\/)?[a-zA-Z0-9_/-]+\.js$/.test(input.entry) || input.entry.split("/").some((p: string) => p === ".." || !p))) throw Error("entry 必须为模块内相对 JS 路径");
  return { id: input.id, name: input.name, desc: input.desc ?? "", schemaVersion: 1, sdkVersion: 1, entry: input.entry, menus, panels, settingsPages, navigation };
}
