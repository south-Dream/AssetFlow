import { app, ipcMain, protocol } from "electron";
import { randomUUID } from "node:crypto";
import { systemSandboxDocument } from "./sandbox";
import path from "node:path";
import fs from "node:fs/promises";
import { SystemExtensionLoader } from "./loader";
import { validatePropertyValues, validateValues } from "../canvas/config";
export async function registerSystemExtensions(directoryOverride?: string) {
  const base = app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
  // Forge extraResource is under resources; portable release keeps extensions next to exe.
  const portable = path.join(base, "scripts/extensions/system_modules");
  let directory = portable;
  if (app.isPackaged) { try { await fs.access(portable); } catch { directory = path.join(process.resourcesPath, "scripts/extensions/system_modules"); } }
  const records = await new SystemExtensionLoader(directoryOverride ?? directory).snapshot();
  const documents = new Map<string, { owner: number; html: string }>();
  protocol.handle("assetflow-system", request => { const document = documents.get(request.url); return new Response(document?.html ?? "会话已关闭", { status: document ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }); });
  ipcMain.handle("systemExtensions.mount", (event, id: string) => {
    const record = records.find(record => !record.error && record.config?.id === id);
    if (!record?.config || documents.size >= 64) throw Error("系统扩展不可用或会话过多");
    const url = `assetflow-system://session/${randomUUID()}`;
    documents.set(url, { owner: event.sender.id, html: systemSandboxDocument(record.config, record.source) });
    return url;
  });
  ipcMain.handle("systemExtensions.unmount", (event, url: string) => { if (documents.get(url)?.owner === event.sender.id) documents.delete(url); });
  const store = path.join(app.getPath("userData"), "system-extension-values.json");
  let values: Record<string, Record<string, string | number | boolean>> = {};
  try { const saved = JSON.parse(await fs.readFile(store, "utf8")); if (saved && typeof saved === "object" && !Array.isArray(saved)) values = saved; } catch {}
  ipcMain.handle("systemExtensions.snapshot", () => records);
  const panelFor = (id: string) => {
    const panel = records.flatMap(record => record.config?.panels ?? []).find(panel => panel.id === id);
    if (!panel) throw Error("面板未注册"); return panel;
  };
  ipcMain.handle("systemExtensions.values", (_, id: string) => {
    const panel = panelFor(id);
    try { return panel.renderer === "form" ? validateValues(panel.fields, values[id] ?? {}) : validatePropertyValues(values[id] ?? {}); }
    catch { return panel.renderer === "form" ? validateValues(panel.fields, {}) : {}; }
  });
  let writes = Promise.resolve();
  ipcMain.handle("systemExtensions.saveValues", (_, id: string, input: unknown) => {
    const panel = panelFor(id);
    const next = panel.renderer === "form" ? validateValues(panel.fields, input) : validatePropertyValues(input);
    if (JSON.stringify(next).length > 100000) throw Error("面板配置过大");
    const write = writes.then(async () => {
      const updated = { ...values, [id]: next };
      await fs.mkdir(path.dirname(store), { recursive: true });
      await fs.writeFile(store + ".tmp", JSON.stringify(updated)); await fs.rename(store + ".tmp", store);
      values = updated; return next;
    });
    writes = write.then(() => {}, () => {}); return write;
  });
}
