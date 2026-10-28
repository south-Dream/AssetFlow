import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAssetImporter } from "../scripts/src/main/assetImport";
import { validateImportPaths } from "../scripts/src/shared/importPaths";
import {
  panelFingerprint,
  panelIsDirty,
  visiblePanelSteps,
} from "../scripts/src/renderer/workspace/panelDocument";
import { validatePanelSnapshot } from "../scripts/src/main/panelSnapshot";
import type { Asset, PanelSnapshot, Step } from "../scripts/src/shared";
import {
  canLinkCanvas,
  resolveCanvas,
} from "../scripts/src/renderer/workspace/canvasLinks";

test("canvas connections reject cycles and compose live upstream steps before local edits", () => {
  const links = { b: "a", c: "b" };
  assert.equal(canLinkCanvas(links, "c", "a"), false);
  assert.equal(canLinkCanvas(links, "a", "a"), false);
  assert.equal(canLinkCanvas(links, "a", "d"), true);
  const documents = {
    a: { steps: [step("crop")] },
    b: { steps: [step("color")] },
    c: { steps: [step("resize")] },
  };
  const result = resolveCanvas("c", links, { a: "image" }, documents);
  assert.equal(result.assetId, "image");
  assert.deepEqual(
    result.steps.map((item) => item.id),
    ["crop", "color", "resize"],
  );
  documents.a.steps = [step("updated")];
  assert.equal(
    resolveCanvas("c", links, { a: "image" }, documents).steps[0].id,
    "updated",
  );
  assert.deepEqual(
    resolveCanvas("c", {}, {}, documents).steps.map((item) => item.id),
    ["resize"],
  );
  assert.deepEqual(resolveCanvas("a", { a: "b", b: "a" }, {}, documents), {
    assetId: "",
    steps: [],
  });
});

test("invalid drag paths never fall back to the current directory", async () => {
  for (const input of [
    [""],
    [" "],
    ["."],
    [".."],
    ["file.png"],
    ["C:file.png"],
    ["\\root-relative"],
    ["/root-relative"],
    [null],
  ]) {
    assert.throws(() => validateImportPaths(input, "win32"));
  }
  validateImportPaths(
    ["C:\\images\\one.png", "\\\\server\\share\\two.png"],
    "win32",
  );
  const assets = new Map<string, Asset>();
  const importer = createAssetImporter(assets);
  await assert.rejects(importer([""], true));
  assert.equal(assets.size, 0);
});

test("single file import excludes siblings while explicit directory import preserves descendants", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asset-import-scope-"));
  try {
    const first = path.join(root, "one.txt"),
      sibling = path.join(root, "application.dll");
    await fs.writeFile(first, "one");
    await fs.writeFile(sibling, "two");
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "three.txt"), "three");
    const importer = createAssetImporter(new Map());
    const one = await importer([first], true);
    assert.deepEqual(
      one.map((a) => a.path),
      [first],
    );
    await assert.rejects(importer([first, ""], true));
    const all = await importer([root], true);
    assert.equal(all.filter((a) => a.format !== "directory").length, 3);
    assert.ok(all.some((a) => a.path === sibling));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const step = (id: string): Step => ({
  id,
  processor: "resize",
  enabled: true,
  params: { width: 20 },
});
const snapshot = (steps: Step[]): PanelSnapshot => ({
  version: 1,
  sourcePath: path.resolve("source.png"),
  mode: "image",
  steps,
});

test("save clears visible edits without destroying the original pipeline", () => {
  const current = snapshot([step("old")]);
  assert.equal(panelIsDirty(current, undefined), true);
  const saved = structuredClone(current);
  assert.equal(panelIsDirty(current, saved), false);
  assert.deepEqual(visiblePanelSteps(current.steps, saved, false), []);
  const next = snapshot([...current.steps, step("new")]);
  assert.equal(panelIsDirty(next, saved), true);
  assert.deepEqual(
    visiblePanelSteps(next.steps, saved, false).map((s) => s.id),
    ["new"],
  );
  assert.deepEqual(
    visiblePanelSteps(next.steps, saved, true).map((s) => s.id),
    ["old", "new"],
  );
  const deleted = snapshot(next.steps.filter((s) => s.id !== "old"));
  assert.equal(panelIsDirty(deleted, saved), true);
  assert.deepEqual(
    saved.steps.map((s) => s.id),
    ["old"],
  );
});

test("a save snapshot does not absorb edits made while saving", () => {
  const captured = structuredClone(snapshot([step("one")]));
  const later = snapshot([step("one"), step("two")]);
  assert.notEqual(panelFingerprint(captured), panelFingerprint(later));
  assert.equal(panelIsDirty(later, captured), true);
  assert.equal(panelIsDirty(snapshot([]), snapshot([])), false);
});

test("saved panel configuration validates source paths and processor parameters", () => {
  const original = snapshot([]);
  assert.deepEqual(validatePanelSnapshot(original), original);
  assert.throws(() => validatePanelSnapshot({ ...original, sourcePath: "" }));
  assert.throws(() =>
    validatePanelSnapshot({ ...original, sourcePath: "relative.png" }),
  );
  assert.throws(() =>
    validatePanelSnapshot({
      ...original,
      steps: [{ ...step("bad"), params: { width: -1 } }],
    }),
  );
});
