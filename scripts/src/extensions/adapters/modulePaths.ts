import path from "node:path";
/** Host supplies the app root; every native capability stays under its owner. */
export function canvasModuleDirectory(root: string, canvas: string, module: string, ...children: string[]) {
  for (const segment of [canvas, module, ...children]) if (!/^[a-zA-Z0-9_-]+$/.test(segment)) throw Error("Invalid Canvas module path segment");
  return path.resolve(root, "scripts/extensions", "canvas_moudles", canvas, "modules", module, ...children);
}
