import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ConfigField,
  CanvasValues,
  InspectorUI,
} from "../../extensions/canvas/contracts";
import { validateValues } from "../../extensions/canvas/config";
import { validateInspectorUI } from "../../extensions/canvas/inspectorUI";
import {
  drawField,
  drawerRevision,
  subscribeDrawers,
  type DrawerSession,
} from "./drawerHost";
export function DrawerField({
  windowId,
  field,
  values,
  onChange,
}: {
  windowId: string;
  field: ConfigField;
  values: CanvasValues;
  onChange: (values: CanvasValues) => void;
}) {
  const revision = useSyncExternalStore(subscribeDrawers, drawerRevision);
  const callback = useRef({ values, onChange });
  callback.current = { values, onChange };
  const [session, setSession] = useState<DrawerSession>(),
    [error, setError] = useState("");
  const key = JSON.stringify(values);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    let current: DrawerSession | undefined;
    setError("");
    void drawField(
      windowId,
      field,
      values,
      (value) => {
        try {
          validateValues([field], { [field.id]: value });
          callback.current.onChange({
            ...callback.current.values,
            [field.id]: value,
          });
        } catch (error) {
          setError(String(error));
        }
      },
      controller.signal
    )
      .then((next) => {
        if (!live) next.dispose();
        else {
          try {
            validateInspectorUI(next.tree);
            current = next;
            setSession(next);
          } catch (error) {
            next.dispose();
            setError(String(error));
          }
        }
      })
      .catch((error) => {
        if (live) setError(String(error));
      });
    return () => {
      live = false;
      controller.abort();
      current?.dispose();
    };
  }, [windowId, field, key, revision]);
  let count = 0;
  const render = (node: InspectorUI, depth = 0): React.ReactNode => {
    if (!node || depth > 8 || ++count > 200) return <span>绘制描述超限</span>;
    const event = (value?: unknown) => {
      if (node.event) session?.event(node.event, value);
    };
    if (node.kind === "text") return <span>{String(node.text ?? "")}</span>;
    if (node.kind === "button")
      return (
        <button type="button" onClick={() => event()}>
          {String(node.text ?? "按钮")}
        </button>
      );
    if (node.kind === "input" || node.kind === "slider")
      return (
        <input
          aria-label={field.name}
          type={
            node.kind === "slider"
              ? "range"
              : typeof node.value === "number"
              ? "number"
              : "text"
          }
          value={String(node.value ?? "")}
          min={node.min}
          max={node.max}
          step={node.step}
          onChange={(e) =>
            event(
              typeof node.value === "number" || node.kind === "slider"
                ? Number(e.target.value)
                : e.target.value
            )
          }
        />
      );
    if (node.kind === "row" || node.kind === "column")
      return (
        <div className={`drawer-${node.kind}`}>
          {(node.children ?? []).map((child, i) => (
            <React.Fragment key={i}>{render(child, depth + 1)}</React.Fragment>
          ))}
        </div>
      );
    return <span>不支持的绘制控件</span>;
  };
  return (
    <div className="custom-field-drawer">
      {error ? (
        <span role="alert">{error}</span>
      ) : session ? (
        render(session.tree)
      ) : (
        <span>加载控件…</span>
      )}
    </div>
  );
}
