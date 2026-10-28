import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./navigation-layer.css";
export type MenuEntry = {
  id?: string;
  label: string;
  action?: () => void;
  children?: MenuEntry[];
  checked?: boolean;
};

function NavigationButton({ item, expanded, onClick }: { item: MenuEntry; expanded: boolean; onClick: () => void }) {
  return <button
    type="button"
    data-nav-id={item.id}
    className="navigation-trigger"
    title={item.label}
    aria-haspopup={item.children ? "menu" : undefined}
    aria-expanded={item.children ? expanded : undefined}
    role={item.checked === undefined ? undefined : "menuitemradio"}
    aria-checked={item.checked}
    onClick={onClick}
  ><span className="navigation-label">{item.label}</span></button>;
}

export function MainMenu({ entries, containerId }: { entries: MenuEntry[]; containerId?: string }) {
  const root = useRef<HTMLElement>(null);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const close = () => setOpened(new Set());
    const foreign = (event: Event) => { if ((event as CustomEvent).detail !== root.current) close(); };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target instanceof Node ? event.target : null)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("assetflow:menu-open", foreign);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("assetflow:menu-open", foreign);
    };
  }, []);
  useLayoutEffect(() => {
    const position = () => root.current?.querySelectorAll<HTMLElement>('.navigation-node[data-menu-open="true"]').forEach(node => {
      const button = node.querySelector<HTMLElement>(":scope > .navigation-trigger");
      const popup = node.querySelector<HTMLElement>(":scope > .menu-popup");
      if (!button || !popup) return;
      const rect = button.getBoundingClientRect();
      const nested = node.parentElement?.classList.contains("menu-popup");
      const width = popup.getBoundingClientRect().width || 210;
      let left = nested ? rect.right + 4 : rect.left;
      if (left + width > innerWidth - 4) left = nested ? rect.left - width - 4 : innerWidth - width - 4;
      const top = Math.max(4, Math.min(nested ? rect.top : rect.bottom, innerHeight - 80));
      Object.assign(popup.style, { position: "fixed", left: Math.max(4, left) + "px", top: top + "px", maxHeight: (innerHeight - top - 4) + "px", overflowY: "auto" });
    });
    position();
    window.addEventListener("resize", position);
    root.current?.addEventListener("scroll", position);
    const element = root.current;
    return () => { window.removeEventListener("resize", position); element?.removeEventListener("scroll", position); };
  }, [opened, entries]);
  const render = (items: MenuEntry[], ancestors: string[] = []): React.ReactNode => items.map((item, index) => {
    const key = item.id ?? ancestors.join(".") + "." + index;
    const expanded = opened.has(key);
    return <div key={key} className="navigation-node" data-menu-open={expanded ? "true" : undefined}>
      <NavigationButton item={item} expanded={expanded} onClick={() => {
        window.dispatchEvent(new CustomEvent("assetflow:menu-open", { detail: root.current }));
        if (item.children) setOpened(previous => {
          const next = new Set(ancestors);
          if (!previous.has(key)) next.add(key);
          return next;
        });
        else { setOpened(new Set()); item.action?.(); }
      }} />
      {item.children && <div className="menu-popup" role="menu" hidden={!expanded}>{render(item.children, [...ancestors, key])}</div>}
    </div>;
  });
  return <nav ref={root} className="main-menu navigation-container" aria-label="主菜单" data-navigation-container={containerId}>
    {render(entries)}
  </nav>;
}
