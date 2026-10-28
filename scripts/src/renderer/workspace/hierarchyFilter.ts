import type { Asset } from "../../shared";
import { folderPath, type Hierarchy } from "./hierarchy";
import { matchesPattern } from "../../shared/filePatterns";

function normalizeFormat(format: string): string {
  return format.trim().replace(/^\./, "").toLowerCase();
}

export function hierarchyFormats(h: Hierarchy, assets: Asset[]): string[] {
  const ids = new Set(h.assetIds);
  return [...new Set(assets.filter(a => ids.has(a.id)).map(a => normalizeFormat(a.format)).filter(Boolean))].sort();
}

export function filterHierarchy(
  h: Hierarchy, assets: Asset[], search: string, formats: string[],
): Hierarchy {
  const query = search.trim().replace(/\\/g, "/").toLowerCase();
  const allowed = new Set(formats.map(normalizeFormat));
  if (!query && !allowed.size) return h;
  const byId = new Map(assets.map(a => [a.id, a]));
  const assetIds = h.assetIds.filter(id => {
    const asset = byId.get(id);
    if (!asset || (allowed.size && !allowed.has(normalizeFormat(asset.format)))) return false;
    const path = [folderPath(h, h.locations[id] ?? null), asset.name].filter(Boolean).join("/");
    return /[*?]/.test(query)
      ? matchesPattern(query.includes("/") ? path : asset.name, query)
      : path.toLowerCase().includes(query);
  });
  const folders = new Set<string>();
  const byFolder = new Map(h.folders.map(f => [f.id, f]));
  for (const id of assetIds) {
    let parent = h.locations[id];
    while (parent && !folders.has(parent)) {
      folders.add(parent);
      parent = byFolder.get(parent)?.parent ?? null;
    }
  }
  return { ...h, assetIds, folders: h.folders.filter(f => folders.has(f.id)) };
}
