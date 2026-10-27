import React from "react";

export function ReplacePanelDialog({
  name,
  busy,
  onSave,
  onReplace,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onSave: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="settings-backdrop">
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="替换面板内容"
      >
        <strong>替换当前面板内容？</strong>
        <p>
          即将加载 {name}
          。保存会记录当前原图绑定、类型及完整处理步骤，成功后再替换，不覆盖原图。
        </p>
        <p>新导入资源已收录到层级，选择不替换也会保留。</p>
        <button disabled={busy} onClick={onSave}>
          {busy ? "正在保存…" : "保存且替换"}
        </button>
        <button disabled={busy} onClick={onReplace}>
          不保存替换
        </button>
        <button disabled={busy} onClick={onCancel}>
          不替换
        </button>
      </section>
    </div>
  );
}
