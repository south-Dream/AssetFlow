import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CanvasModuleManager } from "./manager";
import { sandboxDocument } from "../../renderer/workspace/moduleSandbox";
import { validateValues, validatePropertyValues } from "./config";
import fs from "node:fs/promises";
import type { Asset } from "../../shared";
import { matchResourceRule, toResourceRef } from "./resources";

export function registerCanvasScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: "assetflow-system", privileges: { standard: true, secure: true, supportFetchAPI: true } },
    {
      scheme: "assetflow-canvas",
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}
export function registerCanvasDocuments(
  manager: CanvasModuleManager,
  assets: Map<string, Asset> = new Map()
) {
  const documents = new Map<
    string,
    { html: string; module: string; owner: number; grants: Set<string> }
  >();
  protocol.handle("assetflow-canvas", (request) => {
    const html = documents.get(request.url)?.html;
    return new Response(html ?? "画布会话已失效", {
      status: html ? 200 : 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  });
  ipcMain.handle("canvasModules.mount", async (event, id, boot) => {
    if (
      typeof boot?.windowId !== "string" ||
      boot.windowId.length > 100 ||
      JSON.stringify(boot).length > 1100000
    )
      throw Error("无效画布启动数据");
    if (documents.size >= 64) throw Error("画布会话达到上限");
    const payload = await manager.payload(id);
    const menuCommands = (menus: typeof payload.config.menus): string[] =>
      menus.flatMap((m) =>
        m.command ? [m.command] : menuCommands(m.children ?? [])
      );
    const inspectorFields = [
      ...(payload.config.inspector?.canvas ?? []),
      ...payload.config.tools.flatMap((tool) => tool.fields ?? []),
    ];
    const commands = [
      ...new Set([
        ...payload.config.tools.map((t) => t.command),
        ...menuCommands(payload.config.menus),
        ...inspectorFields.flatMap((field) =>
          field.command ? [field.command] : []
        ),
      ]),
    ];
    const url = `assetflow-canvas://session/${randomUUID()}`;
    documents.set(url, {
      module: id,
      owner: event.sender.id,
      grants: new Set(),
      html: sandboxDocument(payload.source, {
        config: payload.config,
        windowId: boot.windowId,
        settings: validateValues(payload.config.settings, boot.settings),
        state: boot.state,
        commands,
        capabilities: payload.capabilities,
        previewTarget: boot.previewTarget === "linked" ? "linked" : "self",
        resources: payload.config.resources ?? [],
        drawers: [
          ...(payload.config.bindings ? [`${payload.config.id}.__canvas`, ...payload.config.tools.filter(tool => tool.kind !== "command").map(tool => `${tool.id}.__tool`)] : []),
          ...new Set(
            inspectorFields.flatMap((field) =>
              field.renderer ? [field.renderer] : []
            )
          ),
        ],
        canvasProperties: validateValues(
          payload.config.inspector?.canvas ?? [],
          boot.canvasProperties ?? {}
        ),
      }),
    });
    return url;
  });
  ipcMain.handle("canvasModules.unmount", (event, url) => {
    if (documents.get(url)?.owner === event.sender.id) documents.delete(url);
  });
  ipcMain.handle(
    "canvasModules.authorizeResources",
    async (event, url, ids) => {
      const session = documents.get(url);
      if (
        !session ||
        session.owner !== event.sender.id ||
        !Array.isArray(ids) ||
        ids.length > 100
      )
        throw Error("无效资源会话");
      const refs = ids.map((id) => {
        const asset = assets.get(id);
        if (!asset || asset.error || asset.format === "directory")
          throw Error("资源不可用");
        return toResourceRef(asset);
      });
      const payload = await manager.payload(session.module);
      const rule = matchResourceRule(payload.config.resources ?? [], refs);
      if (!rule) throw Error("此模块未声明对应资源接入规则");
      refs.forEach((ref) => session.grants.add(ref.id));
      return refs;
    }
  );
  ipcMain.handle("canvasModules.readResource", async (event, url, id) => {
    const session = documents.get(url);
    const asset = assets.get(id);
    if (
      !session ||
      session.owner !== event.sender.id ||
      !session.grants.has(id) ||
      !asset
    )
      throw Error("资源未授权给当前画布");
    const file = await fs.open(asset.savedPath ?? asset.path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 128 * 1024 * 1024)
        throw Error("资源必须为文件且不超过 128 MB");
      return Uint8Array.from(await file.readFile()).buffer;
    } finally {
      await file.close();
    }
  });
  return (id: string) => [...documents.values()].some(document => document.module === id);
}

export function registerCanvasModules(
  win: BrowserWindow,
  assets: Map<string, Asset>
) {
  const manager = new CanvasModuleManager(
    path.join(app.getPath("userData"), "canvas-modules.json"),
    ["image", "atlas"].map(id => path.join(app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath(), "scripts/extensions/canvas_modules", id, "config.json"))
  );
  const isInUse = registerCanvasDocuments(manager, assets);
  const validateDocument = (document: any) => {
    if (
      document?.version !== 1 ||
      typeof document.type !== "string" ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(document.type) ||
      typeof document.moduleVersion !== "string" ||
      JSON.stringify(document).length > 1100000
    )
      throw Error("无效画布文档");
    return {
      version: 1 as const,
      type: document.type,
      moduleVersion: document.moduleVersion,
      state: document.state ?? null,
      canvasProperties: validatePropertyValues(document.canvasProperties ?? {}),
    };
  };
  ipcMain.handle("canvasModules.saveDocument", async (_, input) => {
    const document = validateDocument(input);
    const selected = await dialog.showSaveDialog(win, {
      defaultPath: `${document.type}.canvas.json`,
      filters: [{ name: "画布文档", extensions: ["json"] }],
    });
    if (!selected.filePath) return false;
    await fs.writeFile(selected.filePath, JSON.stringify(document, null, 2));
    return true;
  });
  ipcMain.handle("canvasModules.loadDocument", async () => {
    const selected = await dialog.showOpenDialog(win, {
      filters: [{ name: "画布文档", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (selected.canceled) return null;
    if ((await fs.stat(selected.filePaths[0])).size > 1100000)
      throw Error("画布文档超过大小限制");
    return validateDocument(
      JSON.parse(await fs.readFile(selected.filePaths[0], "utf8"))
    );
  });
  // Serialize mutations, including persistence to the shared temporary file.
  let pending = Promise.resolve<unknown>(undefined);
  const mutate = (fn: () => Promise<unknown>) => {
    const result = pending.then(fn);
    pending = result.catch(() => {});
    return result;
  };
  ipcMain.handle("canvasModules.list", () => manager.list());
  ipcMain.handle("canvasModules.payload", (_, id) => manager.payload(id));
  ipcMain.handle("canvasModules.install", () =>
    mutate(async () => {
      const selection = await dialog.showOpenDialog(win, {
        title: "加载画布模块 config.json",
        properties: ["openFile"],
        filters: [{ name: "模块配置", extensions: ["json"] }],
      });
      return selection.canceled
        ? manager.list()
        : manager.install(selection.filePaths[0]);
    })
  );
  ipcMain.handle("canvasModules.change", (_, action, id) =>
    mutate(async () => {
      if (isInUse(id)) throw Error("请先关闭该模块的所有画布，再修改或卸载模块");
      if (action === "reload") return manager.reload(id);
      if (action === "enable") return manager.setEnabled(id, true);
      if (action === "disable") return manager.setEnabled(id, false);
      if (action === "uninstall") return manager.uninstall(id);
      if (action === "uninstall-files") {
        const directory = await manager.moduleDirectory(id);
        const answer = await dialog.showMessageBox(win, { type: "question", title: "卸载 Canvas 模块", message: "卸载模块并移至回收站？", detail: `${directory}\n该文件夹内的 config.json、脚本和模块资源将一起移至回收站。`, buttons: ["取消", "卸载并移至回收站"], defaultId: 0, cancelId: 0 });
        return answer.response === 1 ? manager.uninstallFiles(id, directory => shell.trashItem(directory)) : manager.list();
      }
      throw Error("未知模块管理操作");
    })
  );
}
