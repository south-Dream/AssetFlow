import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateCanvasConfig } from "../scripts/src/extensions/canvas/config";
import { CanvasModuleManager } from "../scripts/src/extensions/canvas/manager";
import { validateValues } from "../scripts/src/extensions/canvas/config";
import { bindInspectorModel } from "../scripts/extensions/canvas_modules/sdk/inspectorAdapter";
import { validateInspectorUI } from "../scripts/src/extensions/canvas/inspectorUI";
import {
  resolveCanvas,
  resolvePreviewCanvas,
} from "../scripts/src/renderer/workspace/canvasLinks";

const config = (id = "map") => ({
  schemaVersion: 1,
  sdkVersion: 1,
  id,
  name: "地图",
  desc: "地图编辑",
  version: "1.0.0",
  tools: [],
  menus: [],
  settings: [],
});

test("preinstalled packages can be disabled and removed without returning on restart", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-default-packages-"));
  try {
    const directory = path.join(root, "image"); await fs.mkdir(directory);
    const file = path.join(directory, "config.json");
    await fs.writeFile(file, JSON.stringify(config("image")));
    const store = path.join(root, "installed.json");
    await fs.writeFile(store, "[]"); // Migrate an existing profile with no third-party packages.
    const manager = new CanvasModuleManager(store, [file]);
    assert.deepEqual((await manager.registry()).map(item => item.id), ["image"]);
    await manager.setEnabled("image", false);
    assert.deepEqual(await manager.registry(), []);
    await manager.uninstall("image");
    assert.deepEqual(await new CanvasModuleManager(store, [file]).list(), []);
    await manager.install(file);
    assert.equal((await manager.registry())[0].id, "image");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("package manager can recycle a module and restores its association if recycling fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-uninstall-"));
  try {
    const directory = path.join(root, "map"); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "config.json"), JSON.stringify(config()));
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await manager.install(path.join(directory, "config.json"));
    await assert.rejects(manager.uninstallFiles("map", async () => { throw Error("Recycle failed"); }));
    assert.equal((await manager.list()).length, 1);
    await manager.uninstallFiles("map", async target => {
      assert.equal(target, await fs.realpath(directory));
      await fs.rename(target, path.join(root, "recycled-map"));
    });
    assert.equal((await manager.list()).length, 0);
    assert.ok(await fs.stat(path.join(root, "recycled-map/config.json")));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("legacy Canvas associations resolve after script directory consolidation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-legacy-"));
  try {
    const directory = path.join(root, "scripts/extensions/canvas_modules/map");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "config.json"), JSON.stringify(config()));
    for (const legacy of ["extensions/canvas_modules", "canvas_modules", "scripts/extensions/canvas_moudles"]) {
      const store = path.join(root, "installed.json");
      await fs.writeFile(store, JSON.stringify([{ id: "map", enabled: true, configPath: path.join(root, legacy, "map/config.json") }]));
      const record = (await new CanvasModuleManager(store).list())[0];
      assert.equal(record.error, undefined);
      assert.equal(record.configPath, await fs.realpath(path.join(directory, "config.json")));
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("Inspector schemas normalize canvas and operation containers without custom parser types", () => {
  const parsed = validateCanvasConfig({
    ...config(),
    entry: "./index.js",
    tools: [{ id: "map.paint", name: "绘制", command: "map.paint" }],
    inspector: {
      canvas: [
        {
          id: "map.grid",
          name: "网格",
          type: "number",
          default: 32,
          min: 8,
          max: 128,
          control: "slider",
          order: 10,
        },
      ],
      operations: {
        "map.paint": [
          {
            id: "map.size",
            name: "尺寸",
            type: "number",
            default: 16,
            renderer: "map.sizeDrawer",
            order: 20,
          },
        ],
      },
    },
  });
  assert.equal(parsed.inspector?.canvas[0].control, "slider");
  assert.equal(parsed.tools[0].fields?.[0].renderer, "map.sizeDrawer");
  assert.deepEqual(validateCanvasConfig(parsed), parsed);
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      inspector: {
        canvas: [
          {
            id: "map.custom",
            name: "特殊",
            type: "injected-parser",
            default: "",
          },
        ],
      },
    })
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      entry: "./index.js",
      inspector: { operations: { "other.paint": [] } },
    })
  );
});

test("module-owned Inspector adapters bind metadata to business models without core hooks", () => {
  const model = { size: 32 };
  const binding = bindInspectorModel(model, {
    describe: () => [
      { id: "map.size", name: "尺寸", type: "number", default: 32, order: 10 },
    ],
    read: (current) => current.size,
    write: (current, _id, value) => {
      current.size = Number(value);
    },
  });
  assert.deepEqual(binding.read(), { "map.size": 32 });
  binding.write({ "map.size": 48, "system.unknown": 999 });
  assert.equal(model.size, 48);
  assert.deepEqual(
    binding.fields.map((field) => field.order),
    [10]
  );
});

test("custom Drawer descriptions reject invalid trees instead of crashing host rendering", () => {
  validateInspectorUI({
    kind: "row",
    children: [
      { kind: "slider", value: 32, min: 8, max: 128, event: "1" },
      { kind: "button", text: "重置", event: "2" },
    ],
  });
  assert.throws(() =>
    validateInspectorUI({ kind: "row", children: "invalid" })
  );
  assert.throws(() => validateInspectorUI({ kind: "html", text: "<script>" }));
  assert.throws(() => validateInspectorUI({ kind: "input", value: {} }));
  assert.throws(() =>
    validateInspectorUI({ kind: "slider", value: 3, min: 10, max: 1 })
  );
});

test("canvas manifests accept metadata-only types and reject reserved IDs, traversal and missing commands", () => {
  assert.equal(validateCanvasConfig(config()).id, "map");
  for (const id of ["../map", "system.map", "image", "", "a/b"])
    assert.throws(() => validateCanvasConfig(config(id)));
  assert.throws(() =>
    validateCanvasConfig({ ...config(), entry: "../escape.js" })
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      tools: [{ id: "map.paint", name: "画笔", command: "system.replace" }],
    })
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      menus: [{ id: "system.type", name: "替换类型", command: "map.paint" }],
    })
  );
  assert.throws(() => validateCanvasConfig({ ...config(), sdkVersion: 999 }));
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      entry: "./index.js",
      tools: [
        {
          id: "map.paint",
          name: "画笔",
          command: "map.paint",
          icon: "../escape.svg",
        },
      ],
    })
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...config(),
      entry: "./index.js",
      tools: [
        {
          id: "map.paint",
          name: "画笔",
          command: "map.paint",
          icon: "https://example.com/icon.png",
        },
      ],
    })
  );
});

test("manager requires explicit association, persists enabled types and rolls back broken reloads", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-modules-"));
  try {
    const directory = path.join(root, "map");
    await fs.mkdir(directory);
    await fs.writeFile(
      path.join(directory, "config.json"),
      JSON.stringify(config())
    );
    const store = path.join(root, "installed.json");
    const manager = new CanvasModuleManager(store);
    assert.equal((await manager.list()).length, 0);
    await manager.install(path.join(directory, "config.json"));
    assert.deepEqual((await manager.registry())[0], {
      id: "map",
      name: "地图",
      desc: "地图编辑",
    });
    await assert.rejects(
      manager.install(path.join(directory, "config.json")),
      /已安装/
    );
    await fs.writeFile(path.join(directory, "config.json"), "{");
    await assert.rejects(manager.reload("map"));
    assert.equal((await manager.registry()).length, 1);
    await fs.writeFile(
      path.join(directory, "config.json"),
      JSON.stringify(config())
    );
    const restored = new CanvasModuleManager(store);
    assert.equal((await restored.registry()).length, 1);
    await manager.setEnabled("map", false);
    assert.equal((await manager.registry()).length, 0);
    assert.equal((await new CanvasModuleManager(store).registry()).length, 0);
    await manager.uninstall("map");
    assert.equal((await manager.list()).length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("manager checks folder identity and confines entry symlinks to module root", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "assetflow-module-path-")
  );
  try {
    const directory = path.join(root, "map");
    await fs.mkdir(directory);
    const file = path.join(directory, "config.json");
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await fs.writeFile(file, JSON.stringify(config("other")));
    await assert.rejects(manager.install(file), /目录/);
    await fs.writeFile(
      file,
      JSON.stringify({ ...config(), entry: "./missing.js" })
    );
    await assert.rejects(manager.install(file));
    assert.equal((await manager.registry()).length, 0);
    await fs.writeFile(path.join(root, "outside.js"), "export default {}");
    await fs.symlink(root, path.join(directory, "escape"), "junction");
    await fs.writeFile(
      file,
      JSON.stringify({ ...config(), entry: "./escape/outside.js" })
    );
    await assert.rejects(manager.install(file), /模块目录/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("scripts and child capability JSON use validated snapshots until manager reload", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "assetflow-module-snapshot-")
  );
  try {
    const directory = path.join(root, "map");
    await fs.mkdir(directory);
    const file = path.join(directory, "config.json");
    await fs.writeFile(
      file,
      JSON.stringify({
        ...config(),
        entry: "./index.js",
        capabilities: [{ id: "map.model", config: "./model.json" }],
      })
    );
    await fs.writeFile(
      path.join(directory, "index.js"),
      "export default {activate(){}}"
    );
    await fs.writeFile(
      path.join(directory, "model.json"),
      JSON.stringify({ model: "first" })
    );
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await manager.install(file);
    await fs.writeFile(path.join(directory, "index.js"), "new source");
    await fs.writeFile(
      path.join(directory, "model.json"),
      JSON.stringify({ model: "second" })
    );
    assert.match((await manager.payload("map")).source, /activate/);
    assert.deepEqual((await manager.payload("map")).capabilities["map.model"], {
      model: "first",
    });
    await manager.reload("map");
    assert.equal((await manager.payload("map")).source, "new source");
    assert.deepEqual((await manager.payload("map")).capabilities["map.model"], {
      model: "second",
    });
    await fs.writeFile(path.join(directory, "model.json"), "{");
    await assert.rejects(manager.reload("map"));
    assert.deepEqual((await manager.payload("map")).capabilities["map.model"], {
      model: "second",
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("draft previews flow to targets without changing the committed image pipeline", () => {
  const original = {
    id: "a",
    processor: "resize",
    enabled: true,
    params: { width: 10 },
  };
  const draft = { ...original, params: { width: 20 } };
  const documents = {
    source: { steps: [original], editing: { draft, fresh: false } },
  };
  assert.equal(
    resolveCanvas(
      "target",
      { target: "source" },
      { source: "asset" },
      documents
    ).steps[0].params.width,
    10
  );
  assert.equal(
    resolvePreviewCanvas(
      "target",
      { target: "source" },
      { source: "asset" },
      documents
    ).steps[0].params.width,
    20
  );
  assert.equal(documents.source.steps[0].params.width, 10);
});

test("inspector and settings validate numeric bounds, select values and default types", () => {
  const fields = [
    {
      id: "map.size",
      name: "尺寸",
      type: "number" as const,
      default: 32,
      min: 8,
      max: 128,
    },
  ];
  assert.deepEqual(validateValues(fields, {}), { "map.size": 32 });
  for (const value of [0, 129, "32", null, Infinity]) {
    if (value === null) continue;
    assert.throws(() => validateValues(fields, { "map.size": value }));
  }
});

test("module icons are confined image snapshots and missing replacements preserve the old icon", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-icons-"));
  try {
    const directory = path.join(root, "map");
    await fs.mkdir(path.join(directory, "icons"), { recursive: true });
    const file = path.join(directory, "config.json");
    await fs.writeFile(
      file,
      JSON.stringify({
        ...config(),
        entry: "./index.js",
        tools: [
          {
            id: "map.paint",
            name: "画笔",
            command: "map.paint",
            icon: "./icons/brush.svg",
            desc: "绘制地块",
          },
        ],
      })
    );
    await fs.writeFile(
      path.join(directory, "index.js"),
      "export default {activate(){}}"
    );
    const icon = path.join(directory, "icons/brush.svg");
    await fs.writeFile(
      icon,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>'
    );
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await manager.install(file);
    const snapshot = (await manager.list())[0].iconData!["./icons/brush.svg"];
    assert.match(snapshot, /^data:image\/svg\+xml;base64,/);
    await fs.rm(icon);
    await assert.rejects(manager.reload("map"));
    assert.equal(
      (await manager.list())[0].iconData!["./icons/brush.svg"],
      snapshot
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
