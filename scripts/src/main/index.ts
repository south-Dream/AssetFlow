import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { WorkspaceAssetStore } from "./workspaceAssets";
import sharp from "sharp";
import { createAssetImporter } from "./assetImport";
import { validateImportPaths } from "../shared/importPaths";
import { registerResourceFiles } from "./resourceFiles";
import { registerPanelFiles } from "./panelFiles";
import { registerCanvasModules, registerCanvasScheme } from "../extensions/canvas/host";
import { registerSystemExtensions } from "../extensions/system/host";
import { canvasModuleDirectory } from "../extensions/adapters/modulePaths";
registerCanvasScheme();
import { writeUnique, zipDirectory } from "../services/output";
import { definitions, validateSteps } from "../core/registry";
import type { Asset, Step, Progress, Output } from "../shared";
let win: BrowserWindow;
const assets = new Map<string, Asset>();
const workers = new Set<Worker>();
const previewWorkers = new Map<string, Worker>();
let activeBatch: Promise<void> | undefined;
let taskController = new AbortController();
let cancelled = false,
  running = false;
function execute(
  file: string,
  steps: Step[],
  index = 0,
  purpose?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (purpose) void previewWorkers.get(purpose)?.terminate();
    const worker = new Worker(path.join(__dirname, "worker.js"), {
      env: {
        ...process.env,
        ASSETFLOW_REMBG_DIRECTORY:
          process.env.ASSETFLOW_REMBG_DIRECTORY ??
          canvasModuleDirectory(app.isPackaged ? (existsSync(path.join(canvasModuleDirectory(path.dirname(app.getPath("exe")), "image", "background-removal", "rembg"), "runner.py")) ? path.dirname(app.getPath("exe")) : process.resourcesPath) : app.getAppPath(), "image", "background-removal", "rembg"),
      },
    });
    const childProcesses = new Set<number>();
    const stopChildren = () => {
      for (const pid of childProcesses) {
        try {
          process.kill(pid);
        } catch {}
      }
      childProcesses.clear();
    };
    workers.add(worker);
    if (purpose) previewWorkers.set(purpose, worker);
    const clean = () => {
      stopChildren();
      workers.delete(worker);
      if (purpose && previewWorkers.get(purpose) === worker)
        previewWorkers.delete(purpose);
      void worker.terminate();
    };
    worker.on("message", (msg) => {
      if (msg.type === "inference-process") {
        childProcesses.add(msg.pid);
        return;
      }
      if (msg.type === "inference-process-exit") {
        childProcesses.delete(msg.pid);
        return;
      }
      clean();
      if (msg.error) reject(Error(msg.error));
      else resolve({ ...msg.result, buffer: Buffer.from(msg.result.buffer) });
    });
    worker.once("error", (e) => {
      clean();
      reject(e);
    });
    worker.once("exit", (code) => {
      stopChildren();
      workers.delete(worker);
      reject(Error(cancelled ? "任务已取消" : `工作进程退出 (${code})`));
    });
    worker.postMessage({ file, steps, index });
  });
}
let workspaceStore: WorkspaceAssetStore;
const importPaths = createAssetImporter(assets, asset => workspaceStore.importAsset(asset));
async function batch(ids: string[], steps: Step[], output: Output) {
  running = true;
  cancelled = false;
  taskController = new AbortController();
  const p: Progress = {
    done: 0,
    total: ids.length,
    success: 0,
    failed: 0,
    cancelled: false,
    current: "",
    errors: [],
  };
  const send = () => {
    if (!win.isDestroyed())
      win.webContents.send("progress", { ...p, errors: [...p.errors] });
  };
  let temp = "";
  let cursor = 0;
  const reserved = new Set<string>();
  try {
    const directory = path.resolve(output.directory);
    await fs.mkdir(directory, { recursive: true });
    temp = output.zip
      ? await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-"))
      : "";
    const base = temp || directory;
    send();
    async function next() {
      while (cursor < ids.length && !cancelled) {
        const index = cursor++;
        const asset = assets.get(ids[index])!;
        p.current = asset.name;
        send();
        try {
          if (asset.error) throw Error(asset.error);
          const result = await execute(asset.path, steps, index);
          if (cancelled) break;
          const relative = output.preserve
            ? path.relative(asset.root, path.dirname(asset.path))
            : "";
          if (relative.startsWith("..") || path.isAbsolute(relative))
            throw Error("不合法的相对目录");
          const targetDir = path.join(base, relative);
          await fs.mkdir(targetDir, { recursive: true });
          await writeUnique(
            targetDir,
            result.name,
            result.buffer,
            new Set([...assets.values()].map((a) => a.path.toLowerCase())),
            reserved,
            taskController.signal
          );
          p.success++;
          for (const warning of result.warnings)
            p.errors.push(`${asset.name}：提示：${warning}`);
        } catch (e) {
          if (!cancelled) {
            p.failed++;
            p.errors.push(`${asset.name}：${(e as Error).message}`);
          }
        } finally {
          p.done++;
          send();
        }
      }
    }
    await Promise.all([next(), next()]);
    if (output.zip && !cancelled)
      await zipDirectory(temp, directory, taskController.signal);
  } catch (e) {
    p.errors.push((e as Error).message);
  } finally {
    if (temp)
      await fs
        .rm(temp, { recursive: true, force: true })
        .catch((e) => p.errors.push("临时文件清理失败：" + e.message));
    p.cancelled = cancelled;
    p.finished = true;
    p.current = "";
    running = false;
    send();
  }
}
app.whenReady().then(async () => {
  workspaceStore = new WorkspaceAssetStore(path.join(app.getPath("userData"), "working-assets"), assets);
  await workspaceStore.restore();
  await registerSystemExtensions();
  win = new BrowserWindow({
    show: !process.argv.includes("--assetflow-smoke"),
    width: 1500,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#131720",
    webPreferences: {
      backgroundThrottling: !process.argv.includes("--assetflow-smoke"),
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  if (process.env.ASSETFLOW_DEV === "1")
    void win.loadURL("http://127.0.0.1:5173");
  else void win.loadFile(path.join(__dirname, "../../ui/index.html"));
  ipcMain.handle("workspace.saveBytes", async (_, id, data, name, revision) => {
    if (!(data instanceof ArrayBuffer) || data.byteLength > 128 * 1024 * 1024 || !Number.isInteger(revision)) throw Error("无效资产保存数据");
    return workspaceStore.commit(id, { data: Buffer.from(data), name, revision });
  });
  ipcMain.handle("workspace.saveImage", async (_, id, steps, revision) => {
    const asset = assets.get(id);
    if (!asset || asset.error || !Number.isInteger(revision)) throw Error("无效保存请求");
    const validated = validateSteps(steps);
    const result = await execute(asset.path, validated);
    const thumbnail = "data:image/png;base64," + (await sharp(result.buffer).resize(160,160,{fit:"inside",withoutEnlargement:true}).png().toBuffer()).toString("base64");
    return workspaceStore.commit(id, { data:result.buffer, name:result.name, revision, steps:validated, width:result.width, height:result.height, format:result.format, thumbnail });
  });
  ipcMain.handle("definitions", () => definitions);
  registerResourceFiles(win, assets, importPaths, execute);
  registerPanelFiles(win, importPaths);
  registerCanvasModules(win, assets);
  ipcMain.handle("remove", (_, id) => {
    if (running) throw Error("任务运行时不能移除资源");
    assets.delete(id);
  });
  ipcMain.handle("import", async (_, folder, recursive) => {
    const result = await dialog.showOpenDialog(win, {
      properties: folder
        ? ["openDirectory", "multiSelections"]
        : ["openFile", "multiSelections"],
    });
    return result.canceled ? [] : importPaths(result.filePaths, !!recursive);
  });
  ipcMain.handle("drop", (_, paths, recursive) => {
    validateImportPaths(paths, process.platform);
    return importPaths(paths, !!recursive);
  });
  ipcMain.handle(
    "preview",
    async (
      _,
      id,
      steps,
      index = 0,
      purpose = "processed",
      windowId = "main"
    ) => {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > 50000 ||
        !["original", "processed"].includes(purpose)
      )
        throw Error("无效预览请求");
      const a = assets.get(id);
      if (!a || a.error) throw Error(a?.error || "资源不存在");
      const result = await execute(
        a.path,
        validateSteps(steps),
        index,
        `${windowId}:${purpose}`
      );
      return {
        ...result,
        buffer: undefined,
        url:
          "data:image/" +
          result.format +
          ";base64," +
          result.buffer.toString("base64"),
      };
    }
  );
  ipcMain.handle("output", async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    });
    return r.filePaths[0] || "";
  });
  ipcMain.handle("run", (_, ids, steps, output) => {
    if (running) throw Error("已有任务正在运行");
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !assets.has(id)))
      throw Error("资源列表无效");
    const validated = validateSteps(steps);
    if (typeof output?.directory !== "string" || !output.directory.trim())
      throw Error("请选择输出目录");
    activeBatch = batch(ids, validated, {
      directory: output.directory,
      preserve: !!output.preserve,
      zip: !!output.zip,
    });
  });
  ipcMain.handle("cancel", async () => {
    cancelled = true;
    taskController.abort();
    await Promise.all([...workers].map((w) => w.terminate()));
  });
  ipcMain.handle("savePreset", async (_, steps) => {
    const validated = validateSteps(steps);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: "AssetFlow-preset.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (r.filePath)
      await fs.writeFile(
        r.filePath,
        JSON.stringify({ version: 1, steps: validated }, null, 2)
      );
  });
  ipcMain.handle("loadPreset", async () => {
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (r.canceled) return null;
    const file = r.filePaths[0];
    if ((await fs.stat(file)).size > 1024 * 1024) throw Error("预设文件过大");
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    if (data.version !== 1) throw Error("不支持的预设版本");
    return validateSteps(data.steps);
  });
});
app.on("window-all-closed", () => {
  taskController.abort();
  for (const w of workers) void w.terminate();
  app.quit();
});
let shuttingDown = false;
app.on("before-quit", (event) => {
  if (!running || shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  cancelled = true;
  taskController.abort();
  void Promise.all([...workers].map((w) => w.terminate()))
    .then(() => activeBatch)
    .finally(() => app.quit());
});
