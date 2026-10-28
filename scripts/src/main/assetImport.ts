import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Asset } from "../shared";
import { validateImportPaths } from "../shared/importPaths";
import { acceptsFile, defaultImportRules, validateImportRules, type ImportRules } from "../shared/filePatterns";

export function createAssetImporter(assets: Map<string, Asset>, materialize?: (asset: Asset) => Promise<Asset>) {
  return async function importPaths(paths: string[], recursive: boolean, inputRules: ImportRules = defaultImportRules) {
    const rules = validateImportRules(inputRules);
    validateImportPaths(paths, process.platform);
    const added: Asset[] = [];
    const known = new Set(
      [...assets.values()].map((a) => (a.sourcePath ?? a.path).toLowerCase()),
    );
    let visited = 0;
    async function visit(file: string, root: string, depth = 0): Promise<void> {
      if (++visited > 50000) throw Error("单次导入超过 50000 个目录项");
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        if (depth > 0 && !recursive) return;
        const existing = [...assets.values()].find(
          (a) => (a.sourcePath ?? a.path).toLowerCase() === file.toLowerCase(),
        );
        added.push(
          existing ?? {
            id: randomUUID(),
            path: file,
            root,
            name: path.basename(file),
            width: 0,
            height: 0,
            format: "directory",
            size: 0,
            thumbnail: "",
          },
        );
        for (const item of await fs.readdir(file))
          await visit(path.join(file, item), root, depth + 1);
        return;
      }
      if (!acceptsFile(path.basename(file), path.relative(root, file).replace(/\\/g, "/"), rules)) return;
      if (known.has(file.toLowerCase())) {
        const existing = [...assets.values()].find(
          (a) => (a.sourcePath ?? a.path).toLowerCase() === file.toLowerCase(),
        );
        if (existing) added.push(existing);
        return;
      }
      known.add(file.toLowerCase());
      const asset: Asset = {
        id: randomUUID(),
        path: file,
        root,
        name: path.basename(file),
        width: 0,
        height: 0,
        format: path.extname(file).slice(1) || "file",
        size: stat.size,
        thumbnail: "",
      };
      try {
        if (!/\.(png|jpe?g|webp)$/i.test(file)) {
          added.push(materialize ? await materialize(asset) : asset);
          return;
        }
        const m = await sharp(file, {
          limitInputPixels: 100_000_000,
        }).metadata();
        if (m.pages && m.pages > 1) throw Error("V0.1 暂不支持多帧图片");
        asset.width = (m.orientation ?? 1) >= 5 ? m.height! : m.width!;
        asset.height = (m.orientation ?? 1) >= 5 ? m.width! : m.height!;
        asset.format = m.format!;
        asset.thumbnail =
          "data:image/png;base64," +
          (
            await sharp(file)
              .rotate()
              .resize(160, 160, { fit: "inside", withoutEnlargement: true })
              .png()
              .toBuffer()
          ).toString("base64");
      } catch (e) {
        asset.error = (e as Error).message;
      }
      added.push(materialize ? await materialize(asset) : asset);
    }
    for (const file of paths) {
      const absolute = path.resolve(file);
      try {
        const stat = await fs.stat(absolute);
        await visit(
          absolute,
          stat.isDirectory() ? absolute : path.dirname(absolute),
        );
      } catch (e) {
        throw Error(`${file}: ${(e as Error).message}`);
      }
    }
    for (const asset of added) if (!assets.has(asset.id)) assets.set(asset.id, asset);
    return added.map(asset => assets.get(asset.id) ?? asset);
  };
}
