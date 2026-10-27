import path from "node:path";
import type { Asset, ImageExportOptions, Step } from "../../shared";
import { validateSteps } from "../../core/registry";

/** Optional image output adapter; the generic package exporter only knows bytes. */
export function createImageExportTransform(
  value: ImageExportOptions,
  execute?: (file: string, steps: Step[], index?: number) => Promise<{ buffer: Buffer; name: string }>,
) {
  if (!value || !["original", "png", "jpeg", "webp"].includes(value.format) ||
      !Number.isInteger(value.quality) || value.quality < 1 || value.quality > 100 ||
      typeof value.template !== "string" || !value.template.trim() || value.template.length > 200 || /[\\/:*?"<>|\u0000-\u001f]/.test(value.template) ||
      typeof value.background !== "string" || !/^#[0-9a-f]{6}$/i.test(value.background)) throw Error("图片输出设置无效");
  const steps = validateSteps([
    ...(value.format === "original" ? [] : [{ id: "export-format", processor: "convert", enabled: true, params: { format: value.format, quality: value.quality, background: value.background } }]),
    { id: "export-name", processor: "rename", enabled: true, params: { prefix: "", suffix: "", find: "", replace: "", template: value.template, numbered: false, start: 1, digits: 3 } },
  ]);
  return async (asset: Asset, index: number) => {
    if (!/^(png|jpe?g|webp)$/i.test(asset.format) || (value.format === "original" && value.template === "{name}")) return undefined;
    if (!execute) throw Error("图片输出适配器不可用");
    const result = await execute(asset.savedPath ?? asset.path, steps, index);
    // Renaming alone must preserve the exact saved bytes and original extension.
    if (value.format === "original") return { name: path.parse(result.name).name + path.extname(asset.name) };
    return { name: result.name, data: result.buffer };
  };
}
