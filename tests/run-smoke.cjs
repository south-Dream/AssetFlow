const { spawnSync } = require("node:child_process");
const electron = require("electron");
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
for (const script of [
  "tests/empty-shell-smoke.cjs",
  "tests/atlas-smoke.cjs",
  "tests/navigation-panels-smoke.cjs",
  "tests/navigation-layer-smoke.cjs",
  "tests/canvas-save-sandbox-smoke.cjs",
  "tests/system-extensions-smoke.cjs",
  "tests/workspace-smoke.cjs",
  "tests/hierarchy-export-smoke.cjs",
  "tests/canvas-modules-smoke.cjs",
  "tests/canvas-resources-smoke.cjs",
  "tests/image-editor-smoke.cjs",
  "tests/save-race-smoke.cjs",
  "tests/inspector-drawers-smoke.cjs",
]) {
  const result = spawnSync(electron, [script], {
    env: environment,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
