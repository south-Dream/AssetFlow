const fs = require("node:fs/promises");
const path = require("node:path");
// Track bundled files; never recursively delete user-added extension directories.
async function syncRelease(source, destination) {
  const root = path.resolve(destination);
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  const manifest = path.join(root, ".assetflow-build-files.json");
  const inside = (relative) => {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === ".." || !part)) throw Error("Invalid build file path");
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw Error("Build file escapes release");
    return target;
  };
  const files = [];
  async function walk(directory, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) files.push(relative);
      else throw Error("Unexpected symlink in build output");
    }
  }
  await walk(source);
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(manifest, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!Array.isArray(previous)) throw Error("Invalid build manifest");
  const next = new Set(files), directories = new Set();
  for (const relative of previous) {
    const file = inside(relative);
    if (next.has(relative)) continue;
    try {
      const real = await fs.realpath(file);
      if (!real.startsWith(realRoot + path.sep)) throw Error("Stale build file escapes release");
      if ((await fs.lstat(file)).isSymbolicLink()) throw Error("Unexpected stale build symlink");
      await fs.unlink(file);
      for (let parent = path.dirname(file); parent !== root && parent.startsWith(root + path.sep); parent = path.dirname(parent)) directories.add(parent);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const directory of [...directories].sort((a,b) => b.length - a.length)) {
    try { await fs.rmdir(directory); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
  }
  await fs.cp(source, root, { recursive: true, force: true });
  await fs.writeFile(manifest, JSON.stringify(files, null, 2));
}
module.exports = { syncRelease };
