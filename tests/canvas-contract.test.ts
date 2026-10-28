import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateCanvasConfig } from "../scripts/src/extensions/canvas/config";

// Runtime coverage of the shared frame and Inspector lives in atlas-smoke.cjs,
// including a synthetic third-party type that needs no custom host branch.
test("atlas exposes layout as its only default quick tool and delegates save/clear to the base", () => {
  const config = validateCanvasConfig(JSON.parse(fs.readFileSync(path.resolve("scripts/extensions/canvas_modules/atlas/config.json"), "utf8")), true);
  assert.deepEqual(config.tools.filter(tool => tool.toolbar).map(tool => tool.id), ["atlas.layout"]);
  assert.ok(!config.tools.some(tool => ["atlas.export", "atlas.clear", "atlas.restore"].includes(tool.id)));
  const layout = config.tools.find(tool => tool.id === "atlas.layout");
  assert.equal(layout?.kind,"tool");
  assert.ok(layout?.fields?.some(field => field.id === "atlas.trim"));
  assert.ok(layout?.fields?.some(field => field.id === "atlas.extrusion"));
  assert.deepEqual(Object.keys(config.bindings!), ["canvas", "nodes"]);
});
