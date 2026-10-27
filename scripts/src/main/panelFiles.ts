import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Asset, PanelSnapshot } from "../shared";
import { validatePanelSnapshot } from "./panelSnapshot";

export function registerPanelFiles(
  win: BrowserWindow,
  importPaths: (paths: string[], recursive: boolean) => Promise<Asset[]>,
) {
  const destinations = new Map<string, { sourcePath: string; file: string }>();
  ipcMain.handle("savePanel", async (_, windowId, input) => {
    if (typeof windowId !== "string" || !windowId || windowId.length > 100)
      throw Error("面板 ID 无效");
    const snapshot = validatePanelSnapshot(input);
    const previous = destinations.get(windowId);
    let file =
      previous?.sourcePath === snapshot.sourcePath ? previous.file : undefined;
    if (!file) {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${path.basename(snapshot.sourcePath)}.assetpanel.json`,
        filters: [{ name: "面板配置", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return false;
      file = result.filePath;
    }
    if (
      path.resolve(file).toLowerCase() ===
      path.resolve(snapshot.sourcePath).toLowerCase()
    )
      throw Error("面板配置不能覆盖源资源");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), {
        flag: "wx",
      });
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    destinations.set(windowId, { sourcePath: snapshot.sourcePath, file });
    return true;
  });
  ipcMain.handle("loadPanel", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "面板配置", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const snapshot = validatePanelSnapshot(
      JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
    );
    if (!(await fs.stat(snapshot.sourcePath)).isFile())
      throw Error("面板源资源必须是单个文件");
    const items = await importPaths([snapshot.sourcePath], false);
    const asset = items.find((item) => item.format !== "directory");
    if (!asset || asset.error) throw Error(asset?.error || "面板源资源不可用");
    return { snapshot, asset };
  });
}
