const { build } = require("esbuild");
const { spawnSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
(async () => {
  const tests = readdirSync("tests").filter(file => file.endsWith(".test.ts")).sort();
  await build({
    entryPoints: tests.map(file => `tests/${file}`),
    outdir: ".test-build/tests",
    outExtension: { ".js": ".cjs" },
    bundle: true,
    loader: { ".svg": "dataurl" },
    platform: "node",
    format: "cjs",
    packages: "external",
  });
  const result = spawnSync(
    process.execPath,
    ["--test", ...tests.map(file => `.test-build/tests/${file.replace(/\.ts$/, ".cjs")}`)],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) {
    const saveHost = spawnSync(process.execPath, ["tests/canvas-save-host.cjs"], { stdio: "inherit" });
    if (saveHost.error) throw saveHost.error;
    process.exitCode = saveHost.status ?? 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
