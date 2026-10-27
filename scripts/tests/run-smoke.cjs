const { spawnSync } = require("node:child_process");
const electron = require("electron");
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
for (const script of [
  "scripts/tests/navigation-panels-smoke.cjs",
  "scripts/tests/navigation-layer-smoke.cjs",
  "scripts/tests/canvas-save-sandbox-smoke.cjs",
  "scripts/tests/system-extensions-smoke.cjs",
  "scripts/tests/workspace-smoke.cjs",
  "scripts/tests/hierarchy-export-smoke.cjs",
  "scripts/tests/canvas-modules-smoke.cjs",
  "scripts/tests/canvas-resources-smoke.cjs",
  "scripts/tests/image-editor-smoke.cjs",
  "scripts/tests/save-race-smoke.cjs",
  "scripts/tests/inspector-drawers-smoke.cjs",
]) {
  const result = spawnSync(electron, [script], {
    env: environment,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
