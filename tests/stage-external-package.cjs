// Simulate manual package merging in an isolated portable copy, never in release.
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
async function stageExternalPackage() {
  const release = path.resolve("release");
  const destination = path.resolve(".cache", `external-package-${randomUUID()}`);
  if (!destination.startsWith(process.cwd() + path.sep)) throw Error("Unexpected package test directory");
  const files = JSON.parse(await fs.readFile(path.join(release, ".assetflow-build-files.json"), "utf8"));
  for (const relative of files) {
    const source = path.resolve(release, relative), target = path.resolve(destination, relative);
    if (!source.startsWith(release + path.sep) || !target.startsWith(destination + path.sep)) throw Error("Package path escapes application directory");
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.link(source, target); } catch { await fs.copyFile(source, target); }
  }
  await fs.cp("examples/extensions", path.join(destination, "scripts/extensions"), { recursive: true, force: false, errorOnExist: true });
  return path.join(destination, "AssetFlow.exe");
}
module.exports = { stageExternalPackage };
if (require.main === module) stageExternalPackage().then(executable => process.stdout.write(executable)).catch(error => { console.error(error); process.exitCode = 1; });
