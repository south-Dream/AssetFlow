const fs = require("node:fs/promises");
const path = require("node:path");
const { includeExtensionAsset } = require("./extension-assets.cjs");
async function prepareExtensionResources() {
  const directory = path.resolve(".cache/forge-resources/scripts/extensions");
  if (!directory.startsWith(process.cwd() + path.sep)) throw Error("Unexpected extension staging path");
  await fs.rm(directory, { recursive: true, force: true });
  await fs.cp("scripts/extensions", directory, { recursive: true, filter: source => includeExtensionAsset("scripts/extensions", source) });
}
module.exports = { prepareExtensionResources };
