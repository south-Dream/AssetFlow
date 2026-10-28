import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export async function writeAtlasExport(directory: string, png: Buffer, metadata: string, name: string): Promise<string> {
  if (typeof name !== "string" || !name.trim() || name.length > 120 || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    throw Error("图集名称无效");
  if (typeof metadata !== "string" || metadata.length > 1024 * 1024) throw Error("图集 JSON 超过 1 MB");
  let parsed: unknown;
  try { parsed = JSON.parse(metadata); } catch { throw Error("图集 JSON 无效"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("图集 JSON 必须是对象");
  if (!Buffer.isBuffer(png) || png.length > 128 * 1024 * 1024) throw Error("图集 PNG 超过 128 MB");
  try {
    const image = await sharp(png, { limitInputPixels: 16_777_216 }).metadata();
    if (image.format !== "png") throw Error("not PNG");
  } catch { throw Error("图集必须为有效 PNG，最多 16777216 像素"); }
  let output = "";
  for (let index = 0; index < 10000; index++) {
    const candidate = path.join(directory, index ? `${name}-${index}` : name);
    try { await fs.mkdir(candidate); output = candidate; break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  if (!output) throw Error("图集输出目录重名过多");
  try {
    await fs.writeFile(path.join(output, `${name}.png`), Uint8Array.from(png), { flag: "wx" });
    await fs.writeFile(path.join(output, `${name}.json`), metadata, { encoding: "utf8", flag: "wx" });
    return output;
  } catch (error) {
    // Only the two files in the newly created directory belong to this operation.
    await fs.unlink(path.join(output, `${name}.png`)).catch(() => {});
    await fs.unlink(path.join(output, `${name}.json`)).catch(() => {});
    await fs.rmdir(output).catch(() => {});
    throw error;
  }
}
