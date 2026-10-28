import test from "node:test";
import assert from "node:assert/strict";
import type { Asset } from "../scripts/src/shared";
import type { Hierarchy } from "../scripts/src/renderer/workspace/hierarchy";
import { filterHierarchy, hierarchyFormats } from "../scripts/src/renderer/workspace/hierarchyFilter";

const assets = [
  { id: "a", name: "Hero.PNG", format: "PNG", path: "private/copy" },
  { id: "b", name: "Theme.wav", format: "wav" },
  { id: "c", name: "Scene.mp4", format: "mp4" },
  { id: "d", name: "notes.custom", format: "custom" },
  { id: "e", name: "Other.png", format: "png" },
] as Asset[];
const hierarchy: Hierarchy = {
  id: "h", title: "Resources", assetIds: ["a", "b", "c", "d"],
  folders: [
    { id: "root", name: "Characters", parent: null },
    { id: "child", name: "Main", parent: "root" },
    { id: "empty", name: "Empty", parent: null },
  ],
  locations: { a: "child", b: "root", c: null, d: null },
};

test("search supports filename and hierarchy path wildcards", () => {
  assert.deepEqual(filterHierarchy(hierarchy, assets, "*.png", []).assetIds, ["a"]);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "Hero.*", []).assetIds, ["a"]);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "Characters/*/*.PNG", []).assetIds, ["a"]);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "*.jpg", []).assetIds, []);
});

test("matches names case-insensitively and retains only their ancestors", () => {
  const result = filterHierarchy(hierarchy, assets, " HERO ", []);
  assert.deepEqual(result.assetIds, ["a"]);
  assert.deepEqual(result.folders.map(f => f.id), ["root", "child"]);
});
test("searches hierarchy paths without depending on stored file paths", () => {
  assert.deepEqual(filterHierarchy(hierarchy, assets, "CHARACTERS/main", []).assetIds, ["a"]);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "private", []).assetIds, []);
});
test("combines search with multiple arbitrary formats", () => {
  assert.deepEqual(filterHierarchy(hierarchy, assets, "", ["WAV", ".mp4", "custom"]).assetIds, ["b", "c", "d"]);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "hero", ["wav"]).assetIds, []);
});
test("offers deduplicated dynamic formats from this hierarchy only", () => {
  assert.deepEqual(hierarchyFormats(hierarchy, assets), ["custom", "mp4", "png", "wav"]);
});
test("keeps empty folders without filters and never changes input", () => {
  const before = JSON.stringify(hierarchy);
  assert.deepEqual(filterHierarchy(hierarchy, assets, "", []).folders, hierarchy.folders);
  filterHierarchy(hierarchy, assets, "hero", ["png"]);
  assert.equal(JSON.stringify(hierarchy), before);
});
