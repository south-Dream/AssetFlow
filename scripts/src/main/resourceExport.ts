import fs from "node:fs/promises";
import path from "node:path";
import type { Asset } from "../shared";
export async function exportResources(
  base: string,
  entries: { id: string; folder: string }[],
  folders: string[],
  assets: Map<string, Asset>,
  transform?: (asset: Asset, index: number) => Promise<{ name: string; data?: Buffer } | undefined>,
): Promise<void> {
  function safe(relative: string): string {
    const target = path.resolve(base, relative);
    if (target !== base && !target.startsWith(base + path.sep))
      throw Error("目录超出导出范围");
    return target;
  }
  const targets = entries.map((entry) => {
    const asset = assets.get(entry.id);
    if (!asset || typeof entry.folder !== "string") throw Error("资源引用无效");
    return { asset, dir: safe(entry.folder) };
  });
  const directories = folders.map((folder) => {
    if (typeof folder !== "string") throw Error("文件夹路径无效");
    return safe(folder);
  });
  await fs.mkdir(base);
  for (const dir of directories) await fs.mkdir(dir, { recursive: true });
  for (const [position, { asset, dir }] of targets.entries()) {
    const output = await transform?.(asset, position);
    const outputName = output?.name ?? asset.name;
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(outputName),
      stem = path.basename(outputName, ext);
    let index = 0;
    while (true) {
      const name = index ? `${stem}_${index}${ext}` : outputName;
      if (path.basename(name) !== name) throw Error("资源文件名无效");
      try {
        if (output?.data) await fs.writeFile(path.join(dir,name), Uint8Array.from(output.data), { flag: "wx" });
        else await fs.copyFile(asset.savedPath ?? asset.path, path.join(dir, name), 1);
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        index++;
      }
    }
  }
}
