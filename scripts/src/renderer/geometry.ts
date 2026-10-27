export type Rect = { left: number; top: number; width: number; height: number };
export type Handle = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function cropDrag(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  width: number,
  height: number
): Rect {
  if (handle === "move")
    return {
      ...rect,
      left: Math.round(clamp(rect.left + dx, 0, width - rect.width)),
      top: Math.round(clamp(rect.top + dy, 0, height - rect.height)),
    };
  let left = rect.left,
    top = rect.top,
    right = left + rect.width,
    bottom = top + rect.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - 1);
  if (handle.includes("e")) right = clamp(right + dx, left + 1, width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 1);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + 1, height);
  left = Math.round(left);
  top = Math.round(top);
  right = Math.round(right);
  bottom = Math.round(bottom);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
export function resizeDrag(
  width: number,
  height: number,
  dx: number,
  dy: number,
  handle: Handle,
  locked: boolean
) {
  let w = width + (handle.includes("e") ? dx : 0),
    h = height + (handle.includes("s") ? dy : 0);
  if (locked) {
    const factor =
      handle === "s"
        ? h / height
        : handle === "e"
        ? w / width
        : Math.abs(dx / width) >= Math.abs(dy / height)
        ? w / width
        : h / height;
    const ratio = clamp(
      factor,
      Math.max(1 / width, 1 / height),
      Math.min(
        32768 / width,
        32768 / height,
        Math.sqrt(100_000_000 / (width * height))
      )
    );
    w = width * ratio;
    h = height * ratio;
  } else {
    w = clamp(w, 1, 32768);
    h = clamp(h, 1, Math.min(32768, Math.floor(100_000_000 / w)));
  }
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}
