const { build } = require("esbuild");
const { spawnSync } = require("node:child_process");
(async () => {
  await build({
    entryPoints: [
      "scripts/tests/workspaceAssets.test.ts",
      "scripts/tests/hierarchyFilter.test.ts",
      "scripts/tests/extensionLayout.test.ts",
      "scripts/tests/systemExtensions.test.ts",
      "scripts/tests/canvasResources.test.ts",
      "scripts/tests/canvasModules.test.ts",
      "scripts/tests/core.test.ts",
      "scripts/tests/geometry.test.ts",
      "scripts/tests/dock.test.ts",
      "scripts/tests/panelState.test.ts",
    ],
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
    [
      "--test",
      ".test-build/tests/workspaceAssets.test.cjs",
      ".test-build/tests/hierarchyFilter.test.cjs",
      ".test-build/tests/extensionLayout.test.cjs",
      ".test-build/tests/systemExtensions.test.cjs",
      ".test-build/tests/canvasResources.test.cjs",
      ".test-build/tests/canvasModules.test.cjs",
      ".test-build/tests/core.test.cjs",
      ".test-build/tests/geometry.test.cjs",
      ".test-build/tests/dock.test.cjs",
      ".test-build/tests/panelState.test.cjs",
    ],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) {
    const saveHost = spawnSync(process.execPath, ["scripts/tests/canvas-save-host.cjs"], { stdio: "inherit" });
    if (saveHost.error) throw saveHost.error;
    process.exitCode = saveHost.status ?? 1;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
