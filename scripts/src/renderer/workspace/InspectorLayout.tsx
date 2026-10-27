import React, { useRef, useState, useEffect } from "react";
export function InspectorLayout({
  title,
  connections,
  children,
}: {
  title: string;
  connections: React.ReactNode;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const [height, setHeight] = useState(180);
  useEffect(() => () => cleanup.current?.(), []);
  const resize = (value: number) =>
    setHeight(
      Math.max(70, Math.min(value, (root.current?.clientHeight ?? 600) - 140))
    );
  return (
    <aside ref={root} className="processors inspector-shell">
      <div className="panel-nav">{title}</div>
      <section
        className="inspector-upper"
        aria-label="画布固有属性"
        style={{ flexBasis: height }}
      >
        {connections}
      </section>
      <div
        className="inspector-resizer"
        role="separator"
        aria-label="调整 Inspector 分区"
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            resize(height + (event.key === "ArrowUp" ? -10 : 10));
          }
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          cleanup.current?.();
          const start = event.clientY,
            initial = height;
          const move = (next: PointerEvent) =>
            resize(initial + next.clientY - start);
          const end = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            cleanup.current = undefined;
          };
          cleanup.current = end;
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end, { once: true });
        }}
      />
      <section className="inspector-lower" aria-label="当前工具参数">
        {children}
      </section>
    </aside>
  );
}
