import React, { useState } from "react";
import type { NavNode } from "../../../extensions/sdk/contracts";
export type SettingsPage = { id: string; name: string; content: React.ReactNode };
/** A flat navigation root and page registry; the selected page owns its content. */
export function SettingsContainer({ pages, initialPage, title, onClose }: { pages: SettingsPage[]; initialPage: string; title: string; onClose: () => void }) {
  const [selected, setSelected] = useState(initialPage);
  const navigation: NavNode = { id: "settings.navigation", name: "设置", children: pages.map(page => ({ id: page.id, name: page.name, command: page.id })) };
  const current = pages.find(page => page.id === selected) ?? pages[0];
  return <div className="settings-backdrop" onPointerDown={onClose}><section className="settings-dialog unified-settings" role="dialog" aria-modal="true" aria-label="设置" onPointerDown={event => event.stopPropagation()}>
    <header><strong>{title}</strong><button onClick={onClose} aria-label="关闭设置">×</button></header>
    <div className="settings-columns"><nav aria-label="设置分类">{navigation.children?.map(node => <button type="button" key={node.id} title={node.name} className={node.id === current?.id ? "active" : ""} aria-current={node.id === current?.id ? "page" : undefined} onClick={() => setSelected(node.command!)}>{node.name}</button>)}</nav>
      <main key={current?.id}><h2 className="settings-page-title">{current?.name}</h2>{current?.content}</main>
    </div>
  </section></div>;
}
