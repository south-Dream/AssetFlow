import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { zipDirectory } from "../services/output";
import { createImageExportTransform } from "../extensions/adapters/imageExport";
import type { Step } from "../shared";
import type { Asset } from "../shared";
import { validateWorkspace } from "./workspaceValidation";
import { exportResources } from "./resourceExport";
export function registerResourceFiles(
  win: BrowserWindow,
  assets: Map<string, Asset>,
  importPaths: (paths: string[], recursive: boolean) => Promise<Asset[]>,
  executeImage?: (file: string, steps: Step[], index?: number) => Promise<{ buffer: Buffer; name: string }>,
) {
  function safe(base: string, relative: string) {
    const target = path.resolve(base, relative);
    if (target !== base && !target.startsWith(base + path.sep))
      throw Error("目录超出导出范围");
    return target;
  }
  ipcMain.handle("exportHierarchy", async (_, entries, folders, name, zip = false, imageOptions) => {
    if (
      !Array.isArray(entries) ||
      !Array.isArray(folders) ||
      typeof name !== "string" ||
      !name.trim() ||
      /[\\/:*?"<>|]/.test(name) ||
      name === "." ||
      name === ".."
    )
      throw Error("导出名称或资源列表无效");
    const transform = imageOptions ? createImageExportTransform(imageOptions, executeImage) : undefined;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return "";
    const base = safe(path.resolve(result.filePaths[0]), name.trim());
    if (!zip) { await exportResources(base, entries, folders, assets, transform); return base; }
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-package-"));
    try {
      const contents = path.join(temporary, "contents");
      await exportResources(contents, entries, folders, assets, transform);
      return await zipDirectory(contents, path.dirname(base), new AbortController().signal, name.trim());
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  });
  ipcMain.handle("saveWorkspace", async (_, data) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: "asset.json",
      filters: [{ name: "资源工作区", extensions: ["json"] }],
    });
    if (result.filePath)
      await fs.writeFile(
        result.filePath,
        JSON.stringify(
          {
            version: 1,
            data,
            assets: [...assets.values()].map((a) => ({
              id: a.id,
              path: a.path,
            })),
          },
          null,
          2,
        ),
      );
  });
  ipcMain.handle("loadWorkspace", async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: "资源工作区", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled) return null;
    const saved = JSON.parse(await fs.readFile(result.filePaths[0], "utf8"));
    validateWorkspace(saved);
    const imported = await importPaths(
      saved.assets.map((a: any) => a.path),
      false,
    );
    const available = [
      ...new Map(
        [...assets.values(), ...imported].map((a) => [a.id, a]),
      ).values(),
    ];
    const ids = new Map(
      saved.assets.map((a: any) => [
        a.id,
        available.find((v) => v.path.toLowerCase() === a.path.toLowerCase())
          ?.id,
      ]),
    );
    for (const h of saved.data.hierarchies) {
      h.assetIds = h.assetIds.map((id: string) => ids.get(id)).filter(Boolean);
      h.locations = Object.fromEntries(
        Object.entries(h.locations ?? {}).flatMap(([id, folder]) =>
          ids.get(id) ? [[ids.get(id), folder]] : [],
        ),
      );
    }
    return { data: saved.data, assets: available };
  });
}
