import fs from "node:fs/promises";
import path from "node:path";
import type { SystemExtensionRecord } from "../../../extensions/sdk/contracts";
import { validateSystemConfig } from "./config";
export class SystemExtensionLoader {
  private loaded?: Promise<SystemExtensionRecord[]>;
  constructor(private directory: string) {}
  snapshot() { return this.loaded ??= this.scan(); }
  private async scan(): Promise<SystemExtensionRecord[]> {
    let entries;
    try { entries = await fs.readdir(this.directory, { withFileTypes: true }); }
    catch (error: any) { if (error.code === "ENOENT") return []; throw error; }
    const root = await fs.realpath(this.directory);
    const confined = async (file: string, base: string, max: number) => {
      const real = await fs.realpath(file); const relative = path.relative(base, real);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw Error("扩展路径越界");
      const stat = await fs.stat(real); if (!stat.isFile() || stat.size > max) throw Error("扩展文件过大或无效");
      return fs.readFile(real, "utf8");
    };
    const records: SystemExtensionRecord[] = [];
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      try {
        const dir = await fs.realpath(path.join(root, entry.name));
        if (path.relative(root, dir).startsWith("..")) throw Error("扩展目录越界");
        const config = validateSystemConfig(JSON.parse(await confined(path.join(dir, "config.json"), dir, 1024 * 1024)));
        if (config.id !== entry.name) throw Error("目录名必须与扩展 ID 一致");
        const source = config.entry ? await confined(path.join(dir, config.entry), dir, 2 * 1024 * 1024) : "";
        records.push({ folder: entry.name, config, source });
      } catch (error) { records.push({ folder: entry.name, source: "", error: String(error) }); }
    }
    return records;
  }
}
