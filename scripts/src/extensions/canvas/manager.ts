import fs from "node:fs/promises";
import path from "node:path";
import { validateCanvasConfig } from "./config";
import type {
  CanvasIdentity,
  CanvasModuleRecord,
  ModulePayload,
} from "./contracts";

type Stored = { id: string; configPath: string; enabled: boolean };
export class CanvasModuleManager {
  private records = new Map<string, CanvasModuleRecord>();
  private initialization?: Promise<void>;
  private sources = new WeakMap<CanvasModuleRecord, string>();
  private capabilities = new WeakMap<
    CanvasModuleRecord,
    Record<string, unknown>
  >();
  constructor(private store: string) {}
  private init() {
    return (this.initialization ??= this.restore());
  }
  private async restore() {
    let stored: Stored[];
    try {
      stored = JSON.parse(await fs.readFile(this.store, "utf8"));
    } catch (e: any) {
      if (e.code === "ENOENT") return;
      throw Error("模块关联记录读取失败", { cause: e });
    }
    if (!Array.isArray(stored)) throw Error("模块关联记录损坏");
    for (const item of stored) {
      try {
        if (
          !item ||
          typeof item.configPath !== "string" ||
          typeof item.enabled !== "boolean"
        )
          throw Error("无效关联记录");
        const record = await this.read(item.configPath);
        if (record.config.id !== item.id || this.records.has(item.id))
          throw Error("模块 ID 与安装记录不符");
        record.enabled = item.enabled;
        this.records.set(item.id, record);
      } catch (e) {
        if (
          item &&
          /^[a-z][a-z0-9_-]*$/.test(item.id) &&
          typeof item.configPath === "string"
        )
          this.records.set(item.id, {
            config: {
              id: item.id,
              name: item.id,
              desc: "",
              version: "unknown",
              schemaVersion: 1,
              sdkVersion: 1,
              tools: [],
              menus: [],
              settings: [],
            },
            configPath: item.configPath,
            enabled: false,
            revision: 0,
            error: String(e),
          });
      }
    }
  }
  private async read(file: string): Promise<CanvasModuleRecord> {
    let configPath: string;
    try { configPath = await fs.realpath(file); }
    catch (error: any) {
      const parts = path.resolve(file).split(path.sep);
      const index = parts.lastIndexOf("canvas_moudles");
      if (error.code !== "ENOENT" || index < 0 || (parts[index - 1] === "extensions" && parts[index - 2] === "scripts")) throw error;
      if (parts[index - 1] === "extensions") parts.splice(index - 1, 0, "scripts");
      else parts.splice(index, 0, "scripts", "extensions");
      configPath = await fs.realpath(parts.join(path.sep));
    }
    if (path.basename(configPath) !== "config.json")
      throw Error("请选择 config.json");
    const stat = await fs.stat(configPath);
    if (stat.size > 1024 * 1024) throw Error("配置超过 1 MB");
    const config = validateCanvasConfig(
      JSON.parse(await fs.readFile(configPath, "utf8"))
    );
    if (path.basename(path.dirname(configPath)) !== config.id)
      throw Error("模块目录名必须与 ID 一致");
    const record: CanvasModuleRecord = {
      config,
      configPath,
      enabled: true,
      revision: Date.now(),
      iconData: {},
    };
    for (const tool of config.tools) {
      if (!tool.icon || record.iconData![tool.icon]) continue;
      const file = await this.confined(record, tool.icon);
      if ((await fs.stat(file)).size > 128 * 1024)
        throw Error("工具图标超过 128 KB");
      const mime = tool.icon.endsWith(".svg")
        ? "image/svg+xml"
        : tool.icon.endsWith(".webp")
        ? "image/webp"
        : /\.jpe?g$/.test(tool.icon)
        ? "image/jpeg"
        : "image/png";
      record.iconData![tool.icon] = `data:${mime};base64,${(
        await fs.readFile(file)
      ).toString("base64")}`;
    }
    this.sources.set(record, await this.source(record));
    const capabilities: Record<string, unknown> = {};
    for (const capability of config.capabilities ?? []) {
      const file = await this.confined(record, capability.config);
      if ((await fs.stat(file)).size > 1024 * 1024)
        throw Error("子能力配置超过 1 MB");
      capabilities[capability.id] = JSON.parse(await fs.readFile(file, "utf8"));
    }
    this.capabilities.set(record, capabilities);
    return record;
  }
  private async source(record: CanvasModuleRecord) {
    if (!record.config.entry) return "";
    const entry = await this.confined(record, record.config.entry);
    if ((await fs.stat(entry)).size > 2 * 1024 * 1024)
      throw Error("模块脚本超过 2 MB");
    return fs.readFile(entry, "utf8");
  }
  private async confined(record: CanvasModuleRecord, file: string) {
    const root = path.dirname(record.configPath);
    const entry = await fs.realpath(path.resolve(root, file));
    const relative = path.relative(root, entry);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw Error("脚本必须位于模块目录内");
    return entry;
  }
  private async persist() {
    await fs.mkdir(path.dirname(this.store), { recursive: true });
    const temporary = this.store + ".tmp";
    await fs.writeFile(
      temporary,
      JSON.stringify(
        [...this.records.values()].map((r) => ({
          id: r.config.id,
          configPath: r.configPath,
          enabled: r.enabled,
        })),
        null,
        2
      )
    );
    await fs.rename(temporary, this.store);
  }
  private async change(id: string, next?: CanvasModuleRecord) {
    const previous = this.records.get(id);
    if (next) this.records.set(id, next);
    else this.records.delete(id);
    try {
      await this.persist();
    } catch (e) {
      if (previous) this.records.set(id, previous);
      else this.records.delete(id);
      throw e;
    }
  }
  async list() {
    await this.init();
    return structuredClone([...this.records.values()]);
  }
  async registry(): Promise<CanvasIdentity[]> {
    return (await this.list())
      .filter((r) => r.enabled && !r.error)
      .map((r) => ({
        id: r.config.id,
        name: r.config.name,
        desc: r.config.desc,
      }));
  }
  async install(file: string) {
    await this.init();
    const record = await this.read(file);
    if (this.records.has(record.config.id))
      throw Error("模块已安装，请使用重新加载");
    await this.change(record.config.id, record);
    return this.list();
  }
  async reload(id: string) {
    await this.init();
    const previous = this.require(id);
    const next = await this.read(previous.configPath);
    if (next.config.id !== id) throw Error("重新加载不能修改 ID");
    next.enabled = previous.enabled;
    next.revision = previous.revision + 1;
    await this.change(id, next);
    return this.list();
  }
  async setEnabled(id: string, enabled: boolean) {
    await this.init();
    const previous = this.require(id);
    const next = enabled ? await this.read(previous.configPath) : previous;
    if (next.config.id !== id) throw Error("模块 ID 已改变");
    const record = { ...next, enabled, revision: previous.revision + 1 };
    this.sources.set(record, this.sources.get(next) ?? "");
    this.capabilities.set(record, this.capabilities.get(next) ?? {});
    await this.change(id, record);
    return this.list();
  }
  async uninstall(id: string) {
    await this.init();
    this.require(id);
    await this.change(id);
    return this.list();
  }
  async moduleDirectory(id: string) {
    await this.init();
    const record = this.require(id);
    if (path.basename(record.configPath) !== "config.json") throw Error("无效模块入口");
    const directory = await fs.realpath(path.dirname(record.configPath));
    if (path.basename(directory) !== id || directory === path.parse(directory).root) throw Error("模块目录与 ID 不符，不能卸载文件");
    return directory;
  }
  async uninstallFiles(id: string, recycle: (directory: string) => Promise<void>) {
    const directory = await this.moduleDirectory(id);
    const previous = this.require(id);
    await this.change(id);
    try { await recycle(directory); }
    catch (error) { await this.change(id, previous); throw error; }
    return this.list();
  }
  async payload(id: string): Promise<ModulePayload> {
    await this.init();
    const record = this.require(id);
    if (!record.enabled || record.error) throw Error("模块未启用");
    return {
      config: structuredClone(record.config),
      source: this.sources.get(record) ?? "",
      revision: record.revision,
      capabilities: structuredClone(this.capabilities.get(record) ?? {}),
    };
  }
  private require(id: string) {
    const record = this.records.get(id);
    if (!record) throw Error("模块未安装");
    return record;
  }
}
