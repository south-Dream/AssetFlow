import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsAsset, assetType } from "../scripts/src/renderer/workspace/assetTypes";
import { savePanelResult } from "../scripts/src/renderer/workspace/savePanelResult";
import type { Bridge, Progress } from "../scripts/src/shared";
import { setModuleRecords } from "../scripts/src/renderer/workspace/moduleRegistry";
import imageConfig from "../scripts/extensions/canvas_modules/image/config.json";

test("panel matching rejects mismatched and unavailable editor types", () => {
  const image: Asset = {
    id: "image",
    name: "image.png",
    format: "png",
    path: "C:/fixtures/image.png",
    root: "C:/fixtures",
    width: 1,
    height: 1,
    size: 1,
    thumbnail: "",
  };
  assert.equal(assetType(image), "image");
  assert.equal(acceptsAsset("image", image), false, "An uninstalled editor cannot accept resources");
  setModuleRecords([{ config: imageConfig as any, configPath: "image/config.json", enabled: true, revision: 1 }]);
  assert.equal(acceptsAsset("image", image), true);
  assert.equal(acceptsAsset("audio", image), false);
  assert.equal(acceptsAsset("image", { ...image, format: "wav" }), false);
  assert.equal(acceptsAsset("image", { ...image, error: "invalid" }), false);
  setModuleRecords([]);
});

test("save waits for successful terminal progress and cleans subscription", async () => {
  let notify!: (progress: Progress) => void;
  let unsubscribed = false;
  let completed = false;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const bridge = {
    chooseOutput: async () => "output",
    onProgress: (fn: (p: Progress) => void) => {
      notify = fn;
      return () => {
        unsubscribed = true;
      };
    },
    run: async () => {
      started();
    },
  } as unknown as Bridge;
  const save = savePanelResult(bridge, "a", []).then((result) => {
    completed = true;
    return result;
  });
  await startedPromise;
  assert.equal(completed, false);
  notify({
    finished: true,
    success: 1,
    failed: 0,
    cancelled: false,
    errors: [],
  } as unknown as Progress);
  assert.equal(await save, true);
  assert.equal(unsubscribed, true);
});

test("save cancellation and processing failure do not allow replacement", async () => {
  assert.equal(
    await savePanelResult({ chooseOutput: async () => "" } as Bridge, "a", []),
    false
  );
  let notify!: (progress: Progress) => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  let unsubscribed = false;
  const bridge = {
    chooseOutput: async () => "output",
    onProgress: (fn: (p: Progress) => void) => {
      notify = fn;
      return () => {
        unsubscribed = true;
      };
    },
    run: async () => {
      started();
    },
  } as unknown as Bridge;
  const save = savePanelResult(bridge, "a", []);
  const rejection = assert.rejects(save);
  await startedPromise;
  notify({
    finished: true,
    success: 0,
    failed: 1,
    cancelled: false,
    errors: ["failed"],
  } as unknown as Progress);
  await rejection;
  assert.equal(unsubscribed, true);
});
import {
  getPanelTypes,
  registerPanelType,
  subscribePanelTypes,
} from "../scripts/src/renderer/workspace/panelTypes";

test("panel type extensions notify mounted menus and clean up without changing existing types", () => {
  const original = getPanelTypes();
  let updates = 0;
  const unsubscribe = subscribePanelTypes(() => updates++);
  const unregister = registerPanelType({ id: "test-extension", label: "Test" });
  try {
    assert.equal(getPanelTypes().at(-1)?.id, "test-extension");
    assert.equal(updates, 1);
    assert.throws(() =>
      registerPanelType({ id: "test-extension", label: "Duplicate" })
    );
    assert.equal(updates, 1);
  } finally {
    unregister();
    unsubscribe();
  }
  assert.deepEqual(getPanelTypes(), original);
  assert.equal(updates, 2);
});
import {
  createHierarchy,
  includeAssets,
  collectAssets,
  collectFolders,
  folderPath,
} from "../scripts/src/renderer/workspace/hierarchy";
import type { Asset } from "../scripts/src/shared";
import { validateWorkspace } from "../scripts/src/main/workspaceValidation";
import { exportResources } from "../scripts/src/main/resourceExport";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("hierarchy export preserves generic bytes, empty folders and colliding names", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "resource-export-test-")
  );
  try {
    const sourceA = path.join(root, "one.wav"),
      sourceB = path.join(root, "two.wav");
    await fs.writeFile(sourceA, Buffer.from([0, 10, 20, 255]));
    await fs.writeFile(sourceB, "second");
    const make = (id: string, file: string): Asset => ({
      id,
      path: file,
      root,
      name: "sound.wav",
      format: "wav",
      width: 0,
      height: 0,
      size: 0,
      thumbnail: "",
    });
    const assets = new Map([
      ["a", make("a", sourceA)],
      ["b", make("b", sourceB)],
    ]);
    const output = path.join(root, "asset");
    await exportResources(
      output,
      [
        { id: "a", folder: "audio" },
        { id: "b", folder: "audio" },
      ],
      ["empty"],
      assets
    );
    assert.deepEqual(
      await fs.readFile(path.join(output, "audio/sound.wav")),
      await fs.readFile(sourceA)
    );
    assert.equal(
      await fs.readFile(path.join(output, "audio/sound_1.wav"), "utf8"),
      "second"
    );
    assert.equal(
      (await fs.stat(path.join(output, "empty"))).isDirectory(),
      true
    );
    await assert.rejects(
      () => exportResources(output, [], [], assets),
      /EEXIST/
    );
    await assert.rejects(
      () =>
        exportResources(
          path.join(root, "invalid"),
          [{ id: "a", folder: "../escape" }],
          [],
          assets
        ),
      /超出/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("workspace loading validates folder cycles and stale resource references", () => {
  const h = createHierarchy("Resources");
  const saved = { version: 1, assets: [], data: { hierarchies: [h] } };
  assert.doesNotThrow(() => validateWorkspace(saved));
  h.folders.push({ id: "loop", name: "folder", parent: "loop" });
  assert.throws(() => validateWorkspace(saved), /文件夹关系/);
  h.folders = [];
  h.assetIds.push("missing");
  assert.throws(() => validateWorkspace(saved), /资源引用/);
});

test("resource folders preserve nested and empty directories and selection exports descendants", () => {
  const asset = (id: string, file: string, format: string): Asset => ({
    id,
    path: file,
    root: "C:/pack",
    name: file.split("/").pop()!,
    format,
    width: 0,
    height: 0,
    size: 0,
    thumbnail: "",
  });
  const h = includeAssets(
    createHierarchy("Resources"),
    [
      asset("dir", "C:/pack", "directory"),
      asset("empty", "C:/pack/empty", "directory"),
      asset("a", "C:/pack/nested/a.wav", "wav"),
      asset("b", "C:/pack/b.json", "json"),
    ],
    null,
    true
  );
  assert.deepEqual(h.assetIds, ["a", "b"]);
  assert.equal(folderPath(h, h.locations.a), "pack/nested");
  assert.deepEqual(collectFolders(h).sort(), [
    "pack",
    "pack/empty",
    "pack/nested",
  ]);
  const nested = h.folders.find((f) => f.name === "nested")!;
  assert.deepEqual(collectAssets(h, [`folder:${nested.id}`]), ["a"]);
  const empty = h.folders.find((f) => f.name === "empty")!;
  assert.deepEqual(collectFolders(h, [`folder:${empty.id}`]), ["pack/empty"]);
  const moved = includeAssets(
    h,
    [asset("a", "C:/pack/nested/a.wav", "wav")],
    null
  );
  assert.equal(moved.locations.a, null);
  assert.equal(moved.assetIds.length, 2);
  assert.equal(h.locations.a, nested.id);
});

test("dropping a single file does not wrap it in its source directory", () => {
  const file: Asset = {
    id: "one",
    path: "C:/pack/one.txt",
    root: "C:/pack",
    name: "one.txt",
    format: "txt",
    width: 0,
    height: 0,
    size: 0,
    thumbnail: "",
  };
  const h = includeAssets(createHierarchy("Resources"), [file], null, true);
  assert.deepEqual(h.folders, []);
  assert.equal(h.locations.one, null);
});
import {
  createDockNode,
  dockPanelCount,
  insertDockPanel,
  moveDockPanel,
  removeDockPanel,
  resizeDockSplit,
} from "../scripts/src/renderer/workspace/model";

test("dock tree supports center tabbing and edge splitting", () => {
  const root = createDockNode("hierarchy:main");
  const canvas = insertDockPanel(root, "canvas:a", root.id, "right");
  assert.equal(canvas.kind, "split");
  const canvasGroup = canvas.kind === "split" ? canvas.second : canvas;
  const tabs = insertDockPanel(canvas, "canvas:b", canvasGroup.id, "center");
  assert.equal(tabs.kind, "split");
  const nestedGroup = tabs.kind === "split" ? tabs.second : tabs;
  assert.equal(nestedGroup.kind, "tabs");
  if (nestedGroup.kind === "tabs")
    assert.deepEqual(nestedGroup.panels, ["canvas:a", "canvas:b"]);
  const inspector = insertDockPanel(
    tabs,
    "inspector",
    canvasGroup.id,
    "bottom"
  );
  assert.equal(inspector.kind, "split");
});

test("removing a dock panel collapses empty split branches", () => {
  const root = createDockNode("hierarchy:main");
  const split = insertDockPanel(root, "inspector", root.id, "right");
  const collapsed = removeDockPanel(split, "hierarchy:main");
  assert.equal(collapsed?.kind, "tabs");
  assert.equal(dockPanelCount(collapsed!, "inspector"), 1);
});

test("hierarchy instances have independent dock identities and can be removed separately", () => {
  const first = createDockNode("hierarchy:main");
  const second = insertDockPanel(first, "hierarchy:2", first.id, "center");
  assert.equal(dockPanelCount(second, "hierarchy:main"), 1);
  assert.equal(dockPanelCount(second, "hierarchy:2"), 1);
  const remaining = removeDockPanel(second, "hierarchy:2");
  assert.equal(dockPanelCount(remaining!, "hierarchy:main"), 1);
  assert.equal(dockPanelCount(remaining!, "hierarchy:2"), 0);
});

test("moving a tab to a split keeps its target and moves the panel only once", () => {
  const root = createDockNode("hierarchy:main");
  const withCanvas = insertDockPanel(root, "canvas:a", root.id, "right");
  const canvasGroup =
    withCanvas.kind === "split" ? withCanvas.second : withCanvas;
  const withSecondCanvas = insertDockPanel(
    withCanvas,
    "canvas:b",
    canvasGroup.id,
    "center"
  );
  const withInspector = insertDockPanel(
    withSecondCanvas,
    "inspector",
    root.id,
    "bottom"
  );
  const targetCanvasGroup =
    withSecondCanvas.kind === "split"
      ? withSecondCanvas.second
      : withSecondCanvas;
  const moved = moveDockPanel(
    withInspector,
    "canvas:b",
    targetCanvasGroup.id,
    "right"
  );
  assert.equal(dockPanelCount(moved, "canvas:b"), 1);
  assert.equal(dockPanelCount(moved, "hierarchy:main"), 1);
  assert.equal(dockPanelCount(moved, "inspector"), 1);
  assert.equal(moved.kind, "split");
});

test("a lone panel dropped on its own edge remains intact", () => {
  const root = createDockNode("hierarchy:main");
  const unchanged = moveDockPanel(root, "hierarchy:main", root.id, "left");
  assert.equal(unchanged.kind, "tabs");
  assert.equal(dockPanelCount(unchanged, "hierarchy:main"), 1);
});

test("a tab can be split out of its own tab group", () => {
  const root = createDockNode("hierarchy:main");
  const withCanvas = insertDockPanel(root, "canvas:a", root.id, "center");
  const moved = moveDockPanel(withCanvas, "canvas:a", root.id, "bottom");
  assert.equal(dockPanelCount(moved, "canvas:a"), 1);
  assert.equal(dockPanelCount(moved, "hierarchy:main"), 1);
  assert.equal(moved.kind, "split");
});

test("split resizing updates the persistent layout ratio within usable bounds", () => {
  const root = createDockNode("hierarchy:main");
  const split = insertDockPanel(root, "inspector", root.id, "right");
  assert.equal(split.kind, "split");
  if (split.kind !== "split") return;
  assert.equal(resizeDockSplit(split, split.id, 0.7).kind, "split");
  const resized = resizeDockSplit(split, split.id, 4);
  assert.equal(resized.kind === "split" ? resized.ratio : 0, 0.88);
});
