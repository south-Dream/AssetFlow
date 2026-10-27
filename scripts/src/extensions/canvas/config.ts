import type { CanvasConfig, ConfigField, CanvasMenu } from "./contracts";
import { composeNavigation, validateNavigation, validateNavigationLayout } from "../navigation";
const reserved = new Set(["image", "audio", "atlas", "video", "flow"]);
function object(value: any): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("配置必须为对象");
}
function text(value: any, name: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw Error(`无效的 ${name}`);
  return value;
}
export function validateCanvasConfig(
  input: unknown,
  builtin = false
): CanvasConfig {
  object(input);
  const id = text(input.id, "id");
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id) || (!builtin && reserved.has(id)))
    throw Error("模块 ID 非法或由系统保留");
  if (input.schemaVersion !== 1 || input.sdkVersion !== 1)
    throw Error("不兼容的配置或 SDK 版本");
  const config: CanvasConfig = {
    id,
    name: text(input.name, "name"),
    desc: typeof input.desc === "string" ? input.desc.slice(0, 2000) : "",
    version: text(input.version, "version"),
    schemaVersion: 1,
    sdkVersion: 1,
    tools: [],
    menus: [],
    settings: [],
  };
  if (input.entry !== undefined) {
    if (
      typeof input.entry !== "string" ||
      !/^(?:\.\/)?[a-zA-Z0-9_/-]+\.js$/.test(input.entry) ||
      input.entry.split("/").some((p: string) => p === ".." || p === "") ||
      input.entry.startsWith("/")
    )
      throw Error("entry 必须为模块内的相对 .js 路径");
    config.entry = input.entry;
  }
  const ids = new Set<string>();
  const scoped = (value: any) => {
    const result = text(value, "扩展 ID");
    if (!result.startsWith(id + ".") || !/^[a-zA-Z0-9_.-]+$/.test(result))
      throw Error("扩展 ID 必须属于模块命名空间");
    return result;
  };
  const unique = (value: any) => {
    const result = scoped(value);
    if (ids.has(result)) throw Error("重复扩展 ID");
    ids.add(result);
    return result;
  };
  const array = (value: any): any[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100)
      throw Error("配置列表最多 100 项");
    return value;
  };
  const fields = (value: any): ConfigField[] =>
    array(value).map((field) => {
      object(field);
      const result: ConfigField = {
        id: unique(field.id),
        name: text(field.name, "字段名称"),
        type: field.type,
        default: field.default,
      };
      if (!["text", "number", "boolean", "select"].includes(field.type))
        throw Error("未知字段类型");
      if (
        typeof field.default !==
        (field.type === "number"
          ? "number"
          : field.type === "boolean"
          ? "boolean"
          : "string")
      )
        throw Error("字段默认值类型不符");
      if (field.type === "number" && !Number.isFinite(field.default))
        throw Error("数字必须有限");
      for (const key of ["min", "max"] as const)
        if (field[key] !== undefined) {
          if (!Number.isFinite(field[key])) throw Error("无效范围");
          result[key] = field[key];
        }
      if (
        result.min !== undefined &&
        result.max !== undefined &&
        result.min > result.max
      )
        throw Error("无效范围");
      if (
        field.type === "number" &&
        ((result.min !== undefined && field.default < result.min) ||
          (result.max !== undefined && field.default > result.max))
      )
        throw Error("默认值超出范围");
      if (field.type === "select") {
        result.options = array(field.options).map((v) => text(v, "选项"));
        if (!result.options.includes(field.default))
          throw Error("默认选项不存在");
      }
      if (field.order !== undefined) {
        if (!Number.isFinite(field.order)) throw Error("无效字段 order");
        result.order = field.order;
      }
      if (field.control !== undefined) {
        if (!["input", "slider", "button"].includes(field.control))
          throw Error("未知控件类型");
        if (
          field.control === "slider" &&
          (field.type !== "number" ||
            !Number.isFinite(field.min) ||
            !Number.isFinite(field.max))
        )
          throw Error("slider 需要数值类型及 min/max");
        if (field.control === "button" && !field.command)
          throw Error("button 需要 command");
        result.control = field.control;
      }
      if (field.renderer !== undefined)
        result.renderer = scoped(field.renderer);
      if (field.command !== undefined) result.command = scoped(field.command);
      return result;
    });
  config.tools = array(input.tools).map((tool) => {
    object(tool);
    if (
      tool.icon !== undefined &&
      (typeof tool.icon !== "string" ||
        !/^(?:\.\/)?[a-zA-Z0-9_/-]+\.(svg|png|webp|jpe?g)$/.test(tool.icon) ||
        tool.icon.startsWith("/") ||
        tool.icon.split("/").some((part: string) => part === ".." || !part))
    )
      throw Error("工具图标必须为模块内的相对图片路径");
    if (
      tool.desc !== undefined &&
      (typeof tool.desc !== "string" || tool.desc.length > 2000)
    )
      throw Error("无效工具描述");
    if (tool.kind !== undefined && !["command", "tool"].includes(tool.kind))
      throw Error("未知工具种类");
    if (
      tool.shortcut !== undefined &&
      (typeof tool.shortcut !== "string" ||
        !/^(?:(?:Ctrl|Alt|Shift)\+)*[A-Za-z0-9]$/.test(tool.shortcut) ||
        /^(Ctrl\+S)$/i.test(tool.shortcut))
    )
      throw Error("快捷键非法或由系统保留");
    return {
      id: unique(tool.id),
      name: text(tool.name, "工具名称"),
      command: scoped(tool.command),
      desc: tool.desc,
      icon: tool.icon,
      kind: tool.kind ?? "tool",
      toolbar: tool.toolbar !== false,
      shortcut: tool.shortcut,
      fields: fields(tool.fields),
    };
  });
  validateNavigation(input.menus, id);
  const menus = (value: any, depth = 0): CanvasMenu[] => {
    if (depth > 6) throw Error("菜单层级过深");
    return array(value).map((menu) => {
      object(menu);
      if (
        menu.placement !== undefined &&
        !["edit", "specific"].includes(menu.placement)
      )
        throw Error("不允许的菜单扩展位置");
      if (menu.placement === "edit") throw Error("固有编辑菜单已固定，请使用独立一级导航");
      const normalized = validateNavigation([{ ...menu, children: menu.children?.map((child: any) => ({ ...child })) }], id)[0];
      return {
        ...normalized,
        id: unique(menu.id),
        name: text(menu.name, "菜单名称"),
        placement: menu.placement ?? "specific",
        ...(menu.action ? { action: normalized.action } : menu.command
          ? { command: scoped(menu.command) }
          : { children: menus(menu.children, depth + 1) }),
      };
    });
  };
  config.menus = menus(input.menus);
  composeNavigation([{ id: "system.edit", name: "编辑", children: [] }], config.menus.map(menu => ({ ...menu, parent: menu.parent ?? "system.root" })));
  config.navigation = validateNavigationLayout(input.navigation, ["system.edit", ...config.menus.filter(menu => !menu.parent || menu.parent === "system.root").map(menu => menu.id)]);
  config.settings = fields(input.settings);
  if (
    config.settings.some(
      (field) => field.renderer || field.command || field.control === "button"
    )
  )
    throw Error(
      "自定义 Drawer 和按钮仅用于画布/操作属性，模块设置仅支持标准字段"
    );
  if (input.inspector !== undefined) object(input.inspector);
  const canvasFields = fields(input.inspector?.canvas);
  const operations: Record<string, ConfigField[]> = {};
  if (input.inspector?.operations !== undefined) {
    object(input.inspector.operations);
    if (Object.keys(input.inspector.operations).length > 100)
      throw Error("操作面板过多");
    for (const [toolId, description] of Object.entries(
      input.inspector.operations
    )) {
      const tool = config.tools.find((tool) => tool.id === toolId);
      if (!tool) throw Error("操作面板必须匹配当前模块工具 ID");
      if (tool.fields?.length)
        throw Error("同一操作不能重复声明 fields 和 inspector.operations");
      tool.fields = fields(description);
    }
  }
  config.inspector = { canvas: canvasFields, operations };
  if (
    !builtin &&
    [
      ...canvasFields,
      ...config.tools.flatMap((tool) => tool.fields ?? []),
    ].some((field) => field.renderer || field.command) &&
    !config.entry
  )
    throw Error("自定义绘制和按钮需要 entry");
  config.capabilities = array(input.capabilities).map((capability) => {
    object(capability);
    const file = text(capability.config, "子能力配置路径");
    if (
      !/^(?:\.\/)?[a-zA-Z0-9_/-]+\.json$/.test(file) ||
      file.startsWith("/") ||
      file.split("/").some((p) => p === ".." || p === "")
    )
      throw Error("子能力配置必须位于模块目录内");
    return { id: unique(capability.id), config: file };
  });
  config.resources = array(input.resources).map((rule) => {
    object(rule);
    const extensions = array(rule.extensions).map((ext) => {
      if (typeof ext !== "string" || !/^[a-z0-9]{1,16}$/i.test(ext))
        throw Error("无效资源扩展名");
      return ext.toLowerCase();
    });
    const mimeTypes = array(rule.mimeTypes).map((mime) => {
      if (
        typeof mime !== "string" ||
        !/^[a-z0-9.+-]+\/(?:[a-z0-9.+-]+|\*)$/.test(mime)
      )
        throw Error("无效 MIME 类型");
      return mime;
    });
    if (!extensions.length && !mimeTypes.length)
      throw Error("资源规则必须声明扩展名或 MIME 类型");
    if (rule.mode !== undefined && !["replace", "append"].includes(rule.mode))
      throw Error("无效资源打开模式");
    if (
      rule.maxCount !== undefined &&
      (!Number.isInteger(rule.maxCount) ||
        rule.maxCount < 1 ||
        rule.maxCount > 100)
    )
      throw Error("资源数量必须为 1 到 100");
    return {
      extensions,
      mimeTypes,
      handler: scoped(rule.handler),
      mode: rule.mode ?? "replace",
      maxCount: rule.maxCount ?? 1,
    };
  });
  if (!builtin && config.resources.length && !config.entry)
    throw Error("资源入口需要脚本 entry");
  const hasCommands = (items: CanvasMenu[]): boolean => items.some(item => !!item.command || hasCommands(item.children ?? []));
  if (!builtin && (config.tools.length || hasCommands(config.menus)) && !config.entry)
    throw Error("声明工具或菜单需要脚本 entry");
  return config;
}

export function fieldDefaults(fields: readonly ConfigField[]) {
  return Object.fromEntries(fields.map((f) => [f.id, f.default]));
}
export function validatePropertyValues(
  input: unknown
): Record<string, string | number | boolean> {
  object(input);
  if (Object.keys(input).length > 100) throw Error("画布属性过多");
  for (const value of Object.values(input))
    if (
      !["string", "number", "boolean"].includes(typeof value) ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw Error("画布属性必须为可序列化基础值");
  return { ...input };
}
export function validateValues(fields: readonly ConfigField[], input: unknown) {
  object(input);
  return Object.fromEntries(
    fields.map((f) => {
      const value = input[f.id] ?? f.default;
      if (
        typeof value !== typeof f.default ||
        (typeof value === "number" &&
          (!Number.isFinite(value) ||
            (f.min !== undefined && value < f.min) ||
            (f.max !== undefined && value > f.max))) ||
        (f.type === "select" && !f.options?.includes(value))
      )
        throw Error(`无效参数：${f.name}`);
      return [f.id, value];
    })
  );
}
