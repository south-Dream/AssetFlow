import { NavigationContainerBase, type NavigationItem, type NavigationNodeConfig } from "../../extensions/sdk/contracts";
export type { NavigationItem } from "../../extensions/sdk/contracts";
export function validateNavigation(input: unknown, namespace: string): NavigationItem[] {
  const seen = new Set<string>(); let count = 0;
  const scoped = (value: unknown) => typeof value === "string" && value.startsWith(namespace + ".") && /^[a-zA-Z0-9_.-]+$/.test(value);
  function read(value: unknown, depth: number): NavigationItem[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || depth > 6) throw Error("导航列表无效或层级过深");
    return value.map(item => {
      if (++count > 200 || !item || !scoped(item.id) || seen.has(item.id)) throw Error("导航 ID 重复或不属于模块命名空间");
      seen.add(item.id);
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 200) throw Error("无效导航名称");
      if ([item.command !== undefined, item.children !== undefined, item.action !== undefined].filter(Boolean).length !== 1) throw Error("导航必须声明 children、command 或 action 之一");
      if (item.command !== undefined && !scoped(item.command)) throw Error("命令必须属于本模块");
      if (item.parent !== undefined && (depth || typeof item.parent !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(item.parent))) throw Error("只有贡献列表根节点可指定 parent");
      if (item.parent?.startsWith("system.") && item.parent !== "system.root") throw Error("系统固有子菜单不开放扩展，请添加独立一级导航");
      if (item.parent && item.parent !== "system.root" && !item.parent.startsWith(namespace + ".")) throw Error("导航 parent 必须属于本模块");
      if (item.order !== undefined && !Number.isFinite(item.order)) throw Error("导航 order 无效");
      if (item.action && (item.action.type !== "openPanel" || typeof item.action.panel !== "string" || !/^[a-z][a-z0-9_-]*\.[a-zA-Z0-9_.-]+$/.test(item.action.panel) || (item.action.host !== undefined && !["dialog", "settings", "dock"].includes(item.action.host)))) throw Error("无效面板动作");
      return { id: item.id, name: item.name, ...(item.parent !== undefined ? { parent: item.parent } : {}), ...(item.order !== undefined ? { order: item.order } : {}), ...(item.children !== undefined ? { children: read(item.children, depth + 1) } : item.command ? { command: item.command } : { action: { type: "openPanel", panel: item.action.panel, host: item.action.host ?? "dialog" } }) } as NavigationItem;
    });
  }
  return read(input, 0);
}
/** Copies protected nodes and only adds contributions; no replace/remove operations. */
export function composeNavigation(base: readonly NavigationItem[], additions: readonly NavigationItem[]): NavigationItem[] {
  const result = structuredClone(base) as NavigationItem[];
  const nodes = new Map<string, NavigationItem>();
  const index = (items: NavigationItem[]) => items.forEach(item => { if (nodes.has(item.id)) throw Error("重复导航 ID: " + item.id); nodes.set(item.id, item); if (item.children) index(item.children); });
  index(result);
  let pending = structuredClone(additions) as NavigationItem[];
  while (pending.length) {
    const remaining: NavigationItem[] = []; let inserted = false;
    for (const item of pending) {
      if (item.parent?.startsWith("system.") && item.parent !== "system.root") throw Error("系统固有子菜单不开放扩展");
      const parent = item.parent && item.parent !== "system.root" ? nodes.get(item.parent) : undefined;
      if (item.parent && item.parent !== "system.root" && !parent) { remaining.push(item); continue; }
      if (parent && !parent.children) throw Error("目标导航不是菜单: " + item.parent);
      const { parent: _target, ...node } = item;
      index([node]); (parent ? parent.children! : result).push(node); inserted = true;
    }
    if (!inserted) throw Error("导航目标不存在或循环: " + remaining.map(x => x.parent).join(", "));
    pending = remaining;
  }
  const sort = (items: NavigationItem[]) => { items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); items.forEach(item => item.children && sort(item.children)); };
  // System root order is owned by the host, regardless of contribution order.
  const system = result.filter(item => item.id.startsWith("system."));
  const extensions = result.filter(item => !item.id.startsWith("system."));
  sort(extensions); return [...system, ...extensions];
}

/** Layout belongs to the host; old region configurations must be migrated. */
export function rejectNavigationLayout(input: unknown): void {
  if (input !== undefined) throw Error("导航已统一为单行，不再支持 navigation 区域配置；请移除 navigation，使用 menus 的 order 排列扩展节点");
}

class SingleRowNavigationContainer extends NavigationContainerBase {
  constructor(private id: string) { super(); }
  build(nodes: readonly NavigationNodeConfig[]) {
    const ids = nodes.map(node => node.id);
    if (new Set(ids).size !== ids.length) throw Error("重复一级导航 ID");
    const system = nodes.filter(node => node.id.startsWith("system."));
    const extensions = nodes.filter(node => !node.id.startsWith("system."));
    return { root: { id: this.id, name: this.id, children: structuredClone([...system, ...extensions]) } };
  }
}
export class SystemNavigationContainer extends SingleRowNavigationContainer {
  constructor() { super("system.top"); }
}
export class CanvasNavigationContainer extends SingleRowNavigationContainer {
  constructor(id = "canvas.top") { super(id); }
}

/** Validate each cumulative contribution before committing it; a bad package stays isolated. */
export function assembleSystemNavigation(base: readonly NavigationItem[], packages: { id: string; menus: NavigationItem[] }[]) {
  let nodes = structuredClone(base) as NavigationItem[];
  const errors: string[] = [];
  for (const contribution of packages) {
    try {
      const menus = validateNavigation(contribution.menus, contribution.id);
      const candidate = composeNavigation(nodes, menus);
      new SystemNavigationContainer().build(candidate);
      nodes = candidate;
    } catch (error) { errors.push(contribution.id + ": " + String(error)); }
  }
  return { nodes, errors };
}
