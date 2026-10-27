import type { Asset } from "../../shared";
export type Folder = { id: string; name: string; parent: string | null };
export type Hierarchy = {
  id: string;
  title: string;
  assetIds: string[];
  folders: Folder[];
  locations: Record<string, string | null>;
};
export function createHierarchy(title: string): Hierarchy {
  return {
    id: crypto.randomUUID(),
    title,
    assetIds: [],
    folders: [],
    locations: {},
  };
}
export function folderPath(h: Hierarchy, id: string | null): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw Error("文件夹循环引用");
    seen.add(id);
    const f = h.folders.find((f) => f.id === id);
    if (!f) break;
    parts.unshift(f.name);
    id = f.parent;
  }
  return parts.join("/");
}
export function collectAssets(h: Hierarchy, selection?: string[]): string[] {
  if (!selection) return h.assetIds;
  return h.assetIds.filter(
    (id) =>
      selection.includes(id) ||
      selection.some(
        (key) =>
          key.startsWith("folder:") &&
          (() => {
            const folder = key.slice(7);
            let parent = h.locations[id];
            const seen = new Set<string>();
            while (parent && !seen.has(parent)) {
              if (parent === folder) return true;
              seen.add(parent);
              parent = h.folders.find((f) => f.id === parent)?.parent ?? null;
            }
            return false;
          })(),
      ),
  );
}
export function collectFolders(h: Hierarchy, selection?: string[]): string[] {
  return h.folders
    .map((f) => folderPath(h, f.id))
    .filter(
      (path) =>
        !selection ||
        selection.some(
          (id) =>
            id.startsWith("folder:") &&
            (() => {
              const selected = folderPath(h, id.slice(7));
              return (
                selected &&
                (path === selected || path.startsWith(selected + "/"))
              );
            })(),
        ),
    );
}
export function includeAssets(
  h: Hierarchy,
  items: Asset[],
  target: string | null,
  preserve = false,
): Hierarchy {
  const next = {
    ...h,
    assetIds: [
      ...new Set([
        ...h.assetIds,
        ...items.filter((a) => a.format !== "directory").map((a) => a.id),
      ]),
    ],
    folders: [...h.folders],
    locations: { ...h.locations },
  };
  for (const item of items) {
    let parent = target;
    if (
      preserve &&
      items.some(
        (a) =>
          a.format === "directory" &&
          a.path.replace(/\\/g, "/").toLowerCase() ===
            item.root.replace(/\\/g, "/").toLowerCase(),
      )
    ) {
      const file = (item.sourcePath ?? item.path).replace(/\\/g, "/"),
        root = item.root.replace(/\\/g, "/");
      const segments = file
        .slice(root.length + 1)
        .split("/")
        .filter(Boolean);
      const relative =
        item.format === "directory" ? segments : segments.slice(0, -1);
      const parts = [root.split("/").pop()!, ...relative].filter(Boolean);
      for (const name of parts) {
        let f = next.folders.find(
          (f) => f.parent === parent && f.name === name,
        );
        if (!f) {
          f = { id: crypto.randomUUID(), name, parent };
          next.folders.push(f);
        }
        parent = f.id;
      }
    }
    if (item.format !== "directory") next.locations[item.id] = parent;
  }
  return next;
}
