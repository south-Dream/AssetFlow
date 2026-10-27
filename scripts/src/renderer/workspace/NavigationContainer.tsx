import React from "react";
import type { NavNode, NavigationLayout, NavigationContainerBase } from "../../../extensions/sdk/contracts";
import { MainMenu, type MenuEntry, type NavigationRegionRenderer } from "./MainMenu";
/** Shared system/Canvas view. Only the container owns placement and region rendering. */
export function NavigationContainer({ entries, container, layout, renderRegion }: {
  entries: MenuEntry[]; container: NavigationContainerBase; layout?: NavigationLayout; renderRegion?: NavigationRegionRenderer;
}) {
  const bindings = new Map<string, MenuEntry>();
  const describe = (items: MenuEntry[], parent = "navigation"): NavNode[] => items.map((item, index) => {
    const id = item.id ?? `${parent}.${index}`;
    bindings.set(id, item);
    return { id, name: item.label, ...(item.children ? { children: describe(item.children, id) } : { command: id }) };
  });
  const arranged = container.build(describe(entries), layout);
  const materialize = (nodes: NavNode[]): MenuEntry[] => nodes.map(node => {
    const binding = bindings.get(node.id);
    return { id: node.id, label: node.name, checked: binding?.checked, ...(node.children ? { children: materialize(node.children) } : { action: binding?.action }) };
  });
  return <MainMenu entries={materialize(arranged.root.children ?? [])} regions={arranged.regions} regionOrder={arranged.order} containerId={arranged.root.id} renderRegion={renderRegion} />;
}
