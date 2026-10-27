import type { Definition, ProcessorDefinition, Step } from "./contracts";
export function validateSteps(input: unknown, definitions: readonly ProcessorDefinition[]): Step[] {
  if (!Array.isArray(input) || input.length > 100)
    throw Error("无效的处理步骤");
  const ids = new Set<string>();
  return input.map((v: any) => {
    const d = definitions.find((d) => d.id === v?.processor);
    if (!d || typeof v.id !== "string" || typeof v.enabled !== "boolean")
      throw Error("未知处理器或步骤格式错误");
    if (!v.id || v.id.length > 100 || ids.has(v.id))
      throw Error("步骤 ID 为空、过长或重复");
    ids.add(v.id);
    if (v.processorVersion !== undefined && v.processorVersion !== d.version)
      throw Error("Unsupported processor version");
    const params = validateParams(d, v.params);
    return { id: v.id, processor: d.id, enabled: v.enabled, params, processorVersion: d.version };
  });
}
export function validateParams(d: Definition, input: unknown): Record<string, unknown> {
    if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input)))
      throw Error("Invalid parameter object");
    const values = (input ?? {}) as Record<string, unknown>;
    const params: Record<string, unknown> = {};
    for (const f of d.fields) {
      const value = values[f.key] ?? f.default;
      if (
        f.type === "number" &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          (f.min !== undefined && value < f.min) ||
          (f.max !== undefined && value > f.max))
      )
        throw Error(`${d.name}：${f.label}无效`);
      if (f.type === "select" && (typeof value !== "string" || !f.options?.includes(value)))
        throw Error("无效选项");
      if (f.type === "boolean" && typeof value !== "boolean")
        throw Error("无效开关");
      if (
        (f.type === "text" || f.type === "color") &&
        (typeof value !== "string" || value.length > 500)
      )
        throw Error("无效文本");
      if (f.type === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)))
        throw Error("无效颜色");
      params[f.key] = value;
    }
    return params;
}