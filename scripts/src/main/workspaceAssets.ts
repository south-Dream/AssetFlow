import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Asset, Step } from "../shared";

/** Imported bases are immutable; committed results belong to the same asset. */
export class WorkspaceAssetStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string, private assets: Map<string, Asset>) {}
  private async persist() {
    await fs.mkdir(this.directory, { recursive: true });
    const temp = path.join(this.directory, `index-${randomUUID()}.tmp`);
    await fs.writeFile(temp, JSON.stringify([...this.assets.values()]));
    await fs.rename(temp, path.join(this.directory, "index.json"));
  }
  async restore() {
    try {
      const records: Asset[] = JSON.parse(await fs.readFile(path.join(this.directory, "index.json"), "utf8"));
      for (const asset of records) {
        const relative = path.relative(this.directory, asset.path);
        if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
        if (asset.savedPath) {
          const saved = path.relative(this.directory, asset.savedPath);
          if (saved.startsWith("..") || path.isAbsolute(saved)) continue;
          await fs.access(asset.savedPath);
        }
        await fs.access(asset.path);
        this.assets.set(asset.id, asset);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  importAsset(asset: Asset): Promise<Asset> {
    const operation = this.queue.then(async () => {
      const existing = [...this.assets.values()].find(item => (item.sourcePath ?? item.path).toLowerCase() === asset.path.toLowerCase());
      if (existing) return existing;
      const directory = path.join(this.directory, asset.id, "base");
      await fs.mkdir(directory, { recursive: true });
      const copied = { ...asset, sourcePath: asset.path, path: path.join(directory, path.basename(asset.name)), revision: 0 };
      await fs.copyFile(asset.path, copied.path, 1);
      this.assets.set(copied.id, copied);
      try { await this.persist(); } catch (error) { this.assets.delete(copied.id); throw error; }
      return copied;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  commit(id: string, result: { data: Buffer; name?: string; revision: number; steps?: Step[]; width?: number; height?: number; format?: string; thumbnail?: string }): Promise<Asset> {
    const operation = this.queue.then(async () => {
      const asset = this.assets.get(id);
      if (!asset) throw Error("资产不存在");
      if ((asset.revision ?? 0) !== result.revision) throw Error("资产版本已被另一个画布保存，请重新打开资产后再保存");
      const name = result.name ?? asset.name;
      if (!name || name.length > 255 || path.basename(name) !== name || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) throw Error("资产名称无效");
      const directory = path.join(this.directory, id, "saved", randomUUID());
      await fs.mkdir(directory, { recursive: true });
      const savedPath = path.join(directory, name);
      await fs.writeFile(savedPath, Uint8Array.from(result.data), { flag: "wx" });
      const next: Asset = { ...asset, name, savedPath, savedSteps: result.steps ?? asset.savedSteps, revision: result.revision + 1, size: result.data.length,
        width: result.width ?? asset.width, height: result.height ?? asset.height, format: result.format ?? asset.format, thumbnail: result.thumbnail ?? asset.thumbnail };
      this.assets.set(id, next);
      try { await this.persist(); } catch (error) { this.assets.set(id, asset); throw error; }
      return next;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
