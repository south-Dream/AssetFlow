const esbuild = require("esbuild");
const fs = require("node:fs/promises");
const path = require("node:path");
async function build() {
  const obsolete = path.resolve("dist/modules");
  if (!obsolete.startsWith(process.cwd() + path.sep)) throw Error("Unexpected generated resource path");
  await fs.rm(obsolete, { recursive: true, force: true });
  await esbuild.build({
    entryPoints: [
      "scripts/src/main/index.ts",
      "scripts/src/main/worker.ts",
      "scripts/src/preload/index.ts",
    ],
    outbase: "scripts/src",
    outdir: "dist/node",
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    packages: "external",
    sourcemap: true,
  });
}
module.exports = build;
if (require.main === module)
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
