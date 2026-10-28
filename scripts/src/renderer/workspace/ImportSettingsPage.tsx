import React, { useEffect, useState } from "react";
import { defaultImportRules } from "../../shared/filePatterns";

export function ImportSettingsPage() {
  const [whitelist, setWhitelist] = useState("");
  const [blacklist, setBlacklist] = useState(defaultImportRules.blacklist.join("\n"));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    window.assetFlow.importRules.get().then(rules => {
      if (!active) return;
      setWhitelist(rules.whitelist.join("\n")); setBlacklist(rules.blacklist.join("\n")); setReady(true);
    }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, []);
  return <form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const split = (text: string) => text.split(/[\n,;，；]+/).map(s => s.trim()).filter(Boolean);
      await window.assetFlow.importRules.save({ whitelist: split(whitelist), blacklist: split(blacklist) });
      setMessage("已保存，对后续导入生效。");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }}>
    <p className="hint">适用于拖入和文件菜单导入。支持 * 和 ?，忽略大小写；每行一条，也可用逗号或分号分隔。黑名单优先，不影响已有资源。</p>
    <fieldset disabled={!ready || busy} style={{ border: 0, padding: 0 }}>
      <label style={{ display: "grid", gap: 8, marginBottom: 16 }}>白名单（留空接收所有类型）<textarea aria-label="导入白名单" rows={5} placeholder="*.jpg&#10;*.png&#10;hero.*" value={whitelist} onChange={event => { setWhitelist(event.target.value); setMessage(""); }} /></label>
      <label style={{ display: "grid", gap: 8, marginBottom: 16 }}>黑名单<textarea aria-label="导入黑名单" rows={5} placeholder="*.meta" value={blacklist} onChange={event => { setBlacklist(event.target.value); setMessage(""); }} /></label>
      <button type="submit">{busy ? "保存中…" : "保存导入规则"}</button>
    </fieldset>
    <p role="status">{message}</p>
  </form>;
}
