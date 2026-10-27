export function validateWorkspace(saved: any): void {
  const validName = (name: unknown) =>
    typeof name === "string" &&
    !!name.trim() &&
    !/[\\/:*?"<>|]/.test(name) &&
    name !== "." &&
    name !== "..";
  if (
    saved?.version !== 1 ||
    !Array.isArray(saved.assets) ||
    !Array.isArray(saved.data?.hierarchies) ||
    !saved.data.hierarchies.length
  )
    throw Error("工作区格式无效");
  const assetIds = new Set<string>();
  for (const a of saved.assets) {
    if (
      typeof a?.id !== "string" ||
      typeof a.path !== "string" ||
      !a.path ||
      assetIds.has(a.id)
    )
      throw Error("工作区资源记录无效");
    assetIds.add(a.id);
  }
  const hierarchyIds = new Set<string>();
  for (const h of saved.data.hierarchies) {
    if (
      typeof h?.id !== "string" ||
      typeof h.title !== "string" ||
      hierarchyIds.has(h.id) ||
      !Array.isArray(h.assetIds) ||
      !Array.isArray(h.folders) ||
      !h.locations ||
      typeof h.locations !== "object"
    )
      throw Error("工作区层级无效");
    hierarchyIds.add(h.id);
    const folders = new Map<string, string | null>();
    for (const f of h.folders) {
      if (
        typeof f?.id !== "string" ||
        folders.has(f.id) ||
        !validName(f.name) ||
        (f.parent !== null && typeof f.parent !== "string")
      )
        throw Error("工作区文件夹无效");
      folders.set(f.id, f.parent);
    }
    for (const id of folders.keys()) {
      const seen = new Set<string>();
      let current: string | null = id;
      while (current !== null) {
        if (seen.has(current) || !folders.has(current))
          throw Error("工作区文件夹关系无效");
        seen.add(current);
        current = folders.get(current)!;
      }
    }
    for (const id of h.assetIds)
      if (
        !assetIds.has(id) ||
        (h.locations[id] != null && !folders.has(h.locations[id]))
      )
        throw Error("工作区资源引用无效");
  }
}
