import React from "react";
import type { NavigationNodeConfig, NavigationContainerBase } from "../../../extensions/sdk/contracts";
import { MainMenu, type MenuEntry } from "./MainMenu";
/** Shared single-row system/Canvas view. System nodes always come first. */
export function NavigationContainer({ entries, container }: {
  entries: MenuEntry[]; container: NavigationContainerBase;
}) {
  const bindings = new Map<string, MenuEntry>();
  const describe = (items: MenuEntry[], parent = "navigation"): NavigationNodeConfig[] => items.map((item, index) => {
    const id = item.id ?? `${parent}.${index}`;
    bindings.set(id, item);
    return { id, name: item.label, ...(item.children ? { children: describe(item.children, id) } : { command: id }) };
  });
  const arranged = container.build(describe(entries));
  const materialize = (nodes: NavigationNodeConfig[]): MenuEntry[] => nodes.map(node => {
    const binding = bindings.get(node.id);
    return { id: node.id, label: node.name, checked: binding?.checked, ...(node.children ? { children: materialize(node.children) } : { action: binding?.action }) };
  });
  return <MainMenu entries={materialize(arranged.root.children ?? [])} containerId={arranged.root.id} />;
}
