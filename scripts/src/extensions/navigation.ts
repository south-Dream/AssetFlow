import { NavigationContainerBase, type NavigationItem, type NavNode, type NavigationLayout, type NavigationRegions } from "../../extensions/sdk/contracts";
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
  sort(result); return result;
}

export function validateNavigationLayout(input: unknown, rootIds: readonly string[]): NavigationLayout | undefined {
  if (input === undefined) return;
  const value = input as NavigationLayout;
  if (!value || typeof value !== "object" || !value.regions || typeof value.regions !== "object" || Array.isArray(value.regions) || Object.keys(value.regions).length > 16) throw Error("无效导航区域配置");
  const assigned = new Set<string>(), regions: NavigationRegions = Object.create(null);
  for (const [region, ids] of Object.entries(value.regions)) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(region) || !Array.isArray(ids) || ids.length > 200) throw Error("无效导航区域");
    regions[region] = ids.map(id => { if (!rootIds.includes(id) || assigned.has(id)) throw Error("导航区域引用未知或重复的一级节点: " + id); assigned.add(id); return id; });
  }
  if (value.order !== undefined && (!Array.isArray(value.order) || value.order.length > 16 || new Set(value.order).size !== value.order.length || value.order.some(region => !Object.hasOwn(regions, region) && !["left", "center", "right"].includes(region)))) throw Error("无效导航区域顺序");
  return { regions, ...(value.order ? { order: [...value.order] } : {}) };
}

/** Placement and rendering belong to the owning container, not to NavNode. */
class RegionNavigationContainer extends NavigationContainerBase {
  constructor(private id: string, private defaultRegion: (node: NavNode) => string) { super(); }
  build(nodes: readonly NavNode[], layout?: NavigationLayout) {
    const ids = nodes.map(node => node.id);
    if (new Set(ids).size !== ids.length) throw Error("重复一级导航 ID");
    const custom = validateNavigationLayout(layout, ids);
    const regions: NavigationRegions = Object.assign(Object.create(null), { left: [], center: [], right: [] });
    const moved = new Set(Object.values(custom?.regions ?? {}).flat());
    for (const node of nodes) if (!moved.has(node.id)) (regions[this.defaultRegion(node)] ??= []).push(node.id);
    for (const [region, items] of Object.entries(custom?.regions ?? {})) (regions[region] ??= []).push(...items);
    const order = [...new Set([...(custom?.order ?? []), "left", "center", "right", ...Object.keys(regions)])];
    return { root: { id: this.id, name: this.id, children: structuredClone(nodes) as NavNode[] }, regions, order };
  }
}
export class SystemNavigationContainer extends RegionNavigationContainer {
  constructor() { super("system.top", () => "left"); }
}
export class CanvasNavigationContainer extends RegionNavigationContainer {
  constructor(id = "canvas.top") { super(id, node => node.id.startsWith("system.") ? "left" : "right"); }
}

/** Validate each cumulative contribution before committing it; a bad package stays isolated. */
export function assembleSystemNavigation(base: readonly NavigationItem[], packages: { id: string; menus: NavigationItem[]; navigation?: NavigationLayout }[]) {
  let nodes = structuredClone(base) as NavigationItem[];
  let regions: NavigationRegions = Object.create(null);
  let order: string[] = [];
  const errors: string[] = [];
  for (const contribution of packages) {
    try {
      const candidate = composeNavigation(nodes, contribution.menus);
      const nextRegions: NavigationRegions = Object.assign(Object.create(null), structuredClone(regions));
      for (const [region, ids] of Object.entries(contribution.navigation?.regions ?? {})) (nextRegions[region] ??= []).push(...ids);
      const nextOrder = [...new Set([...order, ...(contribution.navigation?.order ?? [])])];
      new SystemNavigationContainer().build(candidate, Object.keys(nextRegions).length ? { regions: nextRegions, order: nextOrder } : undefined);
      nodes = candidate; regions = nextRegions; order = nextOrder;
    } catch (error) { errors.push(contribution.id + ": " + String(error)); }
  }
  return { nodes, layout: Object.keys(regions).length ? { regions, order } : undefined, errors };
}
