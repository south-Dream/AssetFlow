export type AtlasItem = {
  id: string; name: string; width: number; height: number;
  sourceWidth?: number; sourceHeight?: number; offsetX?: number; offsetY?: number;
};
export type AtlasFrame = AtlasItem & { x: number; y: number; rotated: false };
export type AtlasOptions = {
  layout: "compact" | "grid"; padding: number; margin: number;
  sizeMode: "auto" | "fixed"; width: number; height: number;
  maxWidth: number; maxHeight: number; powerOfTwo: boolean;
};
export const defaultAtlasOptions: AtlasOptions = {
  layout: "compact", padding: 2, margin: 0, sizeMode: "auto",
  width: 1024, height: 1024, maxWidth: 4096, maxHeight: 4096, powerOfTwo: false,
};
export type AtlasLayout = { width: number; height: number; frames: AtlasFrame[]; occupancy: number };
type Rect = { x: number; y: number; width: number; height: number };
const nextPower = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
const floorPower = (n: number) => 2 ** Math.floor(Math.log2(n));

function compact(items: AtlasItem[], width: number, height: number, padding: number, margin: number): AtlasFrame[] | null {
  let free: Rect[] = [{ x: margin, y: margin, width: width - margin * 2 + padding, height: height - margin * 2 + padding }];
  const frames: AtlasFrame[] = [];
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) =>
    Math.max(b.item.width, b.item.height) - Math.max(a.item.width, a.item.height) || b.item.width * b.item.height - a.item.width * a.item.height || a.index - b.index);
  for (const { item } of sorted) {
    const w = item.width + padding, h = item.height + padding;
    const space = free.filter(r => r.width >= w && r.height >= h).sort((a, b) =>
      Math.min(a.width - w, a.height - h) - Math.min(b.width - w, b.height - h) ||
      Math.max(a.width - w, a.height - h) - Math.max(b.width - w, b.height - h) || a.y - b.y || a.x - b.x)[0];
    if (!space) return null;
    const used = { x: space.x, y: space.y, width: w, height: h };
    frames.push({ ...item, x: used.x, y: used.y, rotated: false });
    const split: Rect[] = [];
    for (const r of free) {
      if (used.x >= r.x + r.width || used.x + w <= r.x || used.y >= r.y + r.height || used.y + h <= r.y) { split.push(r); continue; }
      if (used.x > r.x) split.push({ ...r, width: used.x - r.x });
      if (used.x + w < r.x + r.width) split.push({ ...r, x: used.x + w, width: r.x + r.width - used.x - w });
      if (used.y > r.y) split.push({ ...r, height: used.y - r.y });
      if (used.y + h < r.y + r.height) split.push({ ...r, y: used.y + h, height: r.y + r.height - used.y - h });
    }
    free = split.filter((r, i) => !split.some((s, j) => i !== j && s.x <= r.x && s.y <= r.y && s.x + s.width >= r.x + r.width && s.y + s.height >= r.y + r.height && (s.x !== r.x || s.y !== r.y || s.width !== r.width || s.height !== r.height || j < i)));
  }
  const byId = new Map(frames.map(frame => [frame.id, frame]));
  return items.map(item => byId.get(item.id)!);
}

export function packAtlas(items: AtlasItem[], input: Partial<AtlasOptions> = {}): AtlasLayout {
  const options = { ...defaultAtlasOptions, ...input };
  const { padding, margin, powerOfTwo } = options;
  if (![padding, margin].every(n => Number.isInteger(n) && n >= 0 && n <= 1024)) throw Error("图集间距和边距必须是 0–1024 的整数");
  if (![options.width, options.height, options.maxWidth, options.maxHeight].every(n => Number.isInteger(n) && n > 0 && n <= 16384)) throw Error("图集尺寸必须是 1–16384 的整数");
  if (!["compact", "grid"].includes(options.layout) || !["auto", "fixed"].includes(options.sizeMode)) throw Error("图集布局选项无效");
  if (items.length > 2000) throw Error("单个图集最多支持 2000 张图片");
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw Error("图集图片 ID 重复或为空");
    ids.add(item.id);
    if (![item.width, item.height].every(n => Number.isInteger(n) && n > 0 && n <= 16384)) throw Error(`图片尺寸无效：${item.name}`);
  }
  const fixed = options.sizeMode === "fixed";
  const maxWidth = fixed ? (powerOfTwo ? nextPower(options.width) : options.width) : powerOfTwo ? floorPower(options.maxWidth) : options.maxWidth;
  const maxHeight = fixed ? (powerOfTwo ? nextPower(options.height) : options.height) : powerOfTwo ? floorPower(options.maxHeight) : options.maxHeight;
  if (maxWidth > options.maxWidth || maxHeight > options.maxHeight) throw Error("固定图集尺寸超过最大尺寸，图片放不下");
  if (!items.length) return { width: fixed ? maxWidth : 1, height: fixed ? maxHeight : 1, frames: [], occupancy: 0 };
  const minWidth = Math.max(...items.map(i => i.width)) + margin * 2;
  const minHeight = Math.max(...items.map(i => i.height)) + margin * 2;
  if (minWidth > maxWidth || minHeight > maxHeight) throw Error("图片放不下，请增大图集尺寸或最大宽高");
  const candidates = new Set<number>([minWidth, maxWidth, Math.ceil(Math.sqrt(items.reduce((sum, i) => sum + (i.width + padding) * (i.height + padding), 0))) + margin * 2]);
  for (let w = minWidth; w < maxWidth; w = Math.max(w + 1, Math.ceil(w * 1.2))) candidates.add(w);
  const cellWidth = Math.max(...items.map(i => i.width)) + padding;
  const cellHeight = Math.max(...items.map(i => i.height)) + padding;
  if (options.layout === "grid") for (let columns = 1; columns <= items.length && columns * cellWidth - padding + margin * 2 <= maxWidth; columns++) candidates.add(columns * cellWidth - padding + margin * 2);
  let best: AtlasLayout | null = null;
  const widths = fixed ? [maxWidth] : [...new Set([...candidates].map(w => powerOfTwo ? nextPower(w) : w))].filter(w => w >= minWidth && w <= maxWidth).sort((a, b) => a - b);
  for (const width of widths) {
    let frames: AtlasFrame[] | null;
    if (options.layout === "grid") {
      const columns = Math.floor((width - margin * 2 + padding) / cellWidth);
      if (columns < 1 || Math.ceil(items.length / columns) * cellHeight - padding + margin * 2 > maxHeight) continue;
      frames = items.map((item, index) => ({ ...item, x: margin + index % columns * cellWidth, y: margin + Math.floor(index / columns) * cellHeight, rotated: false }));
    } else frames = compact(items, width, maxHeight, padding, margin);
    if (!frames) continue;
    let usedWidth = Math.max(...frames.map(f => f.x + f.width)) + margin;
    let usedHeight = Math.max(...frames.map(f => f.y + f.height)) + margin;
    if (fixed) { usedWidth = maxWidth; usedHeight = maxHeight; }
    else if (powerOfTwo) { usedWidth = nextPower(usedWidth); usedHeight = nextPower(usedHeight); }
    if (usedWidth > maxWidth || usedHeight > maxHeight) continue;
    const occupancy = items.reduce((sum, i) => sum + i.width * i.height, 0) / (usedWidth * usedHeight);
    const result = { width: usedWidth, height: usedHeight, frames, occupancy };
    if (!best || usedWidth * usedHeight < best.width * best.height || usedWidth * usedHeight === best.width * best.height && Math.abs(usedWidth - usedHeight) < Math.abs(best.width - best.height)) best = result;
  }
  if (!best) throw Error("图片放不下，请增大图集尺寸或最大宽高，或减少间距");
  return best;
}
