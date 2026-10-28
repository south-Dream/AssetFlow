const path = require("node:path");
const excluded = new Set([".venv", "__pycache__", "node_modules"]);
function includeExtensionAsset(root, source) {
  const relative = path.relative(path.toNamespacedPath(path.resolve(root)), path.toNamespacedPath(path.resolve(source)));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  const parts = relative.split(path.sep);
  if (parts.some(part => excluded.has(part)) || source.endsWith(".pyc")) return false;
  const rembg = ["canvas_modules", "image", "modules", "background-removal", "rembg"];
  if (rembg.every((part,index) => parts[index] === part) && ["models", "temp", "downloads"].includes(parts[rembg.length])) return false;
  return true;
}
module.exports = { includeExtensionAsset };
