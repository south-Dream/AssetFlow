import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { canvasModuleDirectory } from "../scripts/src/extensions/adapters/modulePaths";
import { includeExtensionAsset } from "../scripts/build/extension-assets.cjs";

test("module runtimes are located under the owning external Canvas directory", () => {
  assert.equal(canvasModuleDirectory("D:/app", "image", "background-removal", "rembg"), path.resolve("D:/app/scripts/extensions/canvas_modules/image/modules/background-removal/rembg"));
  assert.throws(() => canvasModuleDirectory("D:/app", "../image", "background-removal"));
  assert.throws(() => canvasModuleDirectory("D:/app", "image", "background-removal", "../elsewhere"));
});

test("packaging keeps module scripts/config but excludes local Python environments and caches", () => {
  const root = path.resolve("scripts/extensions");
  assert.equal(includeExtensionAsset(root, path.toNamespacedPath(root)), true, "Windows fs.cp passes namespaced paths even for the root directory");
  assert.equal(includeExtensionAsset(root, path.join(root, "canvas_modules/image/modules/background-removal/rembg/runner.py")), true);
  assert.equal(includeExtensionAsset(root, path.join(root, "canvas_modules/image/modules/background-removal/rembg/config.json")), true);
  assert.equal(includeExtensionAsset(root, path.join(root, "system_modules/example/models/config.json")), true, "do not reserve business folder names in unrelated scripts/extensions");
  for (const directory of [".venv", "models", "temp", "downloads", "__pycache__"]) {
    assert.equal(includeExtensionAsset(root, path.join(root, `canvas_modules/image/modules/background-removal/rembg/${directory}/private-file`)), false);
  }
});
