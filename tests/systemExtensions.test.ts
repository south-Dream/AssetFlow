import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateNavigation, composeNavigation, CanvasNavigationContainer, SystemNavigationContainer, assembleSystemNavigation } from "../scripts/src/extensions/navigation";
import { validateSystemConfig } from "../scripts/src/extensions/system/config";
import { SystemExtensionLoader } from "../scripts/src/extensions/system/loader";
import { syncRelease } from "../scripts/build/sync-release.cjs";
import { validateCanvasConfig } from "../scripts/src/extensions/canvas/config";
import { createDockNode, dockPanelCount, openDockPanel } from "../scripts/src/renderer/workspace/model";

test("shared navigation protects builtin children and permits independent extension trees", () => {
  const base = [{ id: "system.file", name: "文件", children: [{ id: "system.save", name: "保存", children: [] }] }];
  const additions = validateNavigation([
    { id: "demo.menu", name: "扩展", children: [] },
    { id: "demo.export", name: "导出", parent: "demo.menu", command: "demo.run" },
    { id: "demo.direct", name: "偏好", command: "demo.preferences", order: 2 }
  ], "demo");
  const result = composeNavigation(base, additions);
  assert.equal(result[1].children![0].id, "demo.export");
  assert.equal(base[0].children[0].children.length, 0);
  assert.equal(result[2].command, "demo.preferences");
  assert.throws(() => composeNavigation(base, [{ id: "demo.blocked", name: "错误", parent: "system.file", command: "demo.run" }]));
  assert.throws(() => validateNavigation([{ id: "system.file", name: "覆盖", command: "demo.run" }], "demo"));
  assert.throws(() => composeNavigation(base, [{ id: "demo.bad", name: "错误", parent: "system.unknown", command: "demo.run" }]));
  assert.throws(() => validateNavigation([{ id: "demo.bad", name: "错误", command: "demo.run", children: [] }], "demo"));
});

test("Canvas uses the shared additive navigation rules and rejects unavailable parent targets", () => {
  const base = { id: "demo", name: "示例", desc: "", version: "1", schemaVersion: 1, sdkVersion: 1 };
  const config = validateCanvasConfig({ ...base, menus: [{ id: "demo.preference", name: "偏好", order: 20, action: { type: "openPanel", panel: "preferences.general", host: "settings" } }] });
  assert.equal(config.menus[0].action?.panel, "preferences.general");

  assert.throws(() => validateCanvasConfig({ ...base, navigation: { regions: { left: ["unknown.id"] } } }));
  assert.throws(() => validateCanvasConfig({ ...base, menus: [{ id: "demo.old", name: "旧入口", placement: "edit", command: "demo.run" }], entry: "index.js" }));
  assert.throws(() => validateCanvasConfig({ ...base, menus: [{ id: "demo.bad", name: "错误", parent: "system.missing", children: [] }] }));
});

test("both navigation containers keep system nodes first in host order", () => {
  const nodes = [
    { id: "demo.open", name: "Open", command: "demo.open", order: -1000 },
    { id: "system.file", name: "File", children: [], order: 100 },
    { id: "system.edit", name: "Edit", children: [], order: -100 }
  ];
  for (const container of [new CanvasNavigationContainer(), new SystemNavigationContainer()]) {
    const result = container.build(nodes);
    assert.deepEqual(result.root.children!.map(node => node.id), ["system.file", "system.edit", "demo.open"]);
    assert.equal("regions" in result, false);
    result.root.children![0].name = "Changed";
    assert.equal(nodes[1].name, "File");
    assert.throws(() => container.build([...nodes, nodes[0]]));
  }
  assert.deepEqual(composeNavigation(nodes.slice(1), [nodes[0]]).map(node => node.id), ["system.file", "system.edit", "demo.open"]);
});

test("extension order sorts only extension trees and preserves builtin children", () => {
  const base = [{ id: "system.edit", name: "Edit", children: [
    { id: "system.first", name: "First", children: [], order: 100 },
    { id: "system.second", name: "Second", children: [], order: -100 }
  ] }];
  const result = composeNavigation(base, [
    { id: "demo.later", name: "Later", command: "demo.run", order: 0 },
    { id: "demo.earlier", name: "Earlier", command: "demo.run", order: -100 }
  ]);
  assert.deepEqual(result.map(node => node.id), ["system.edit", "demo.earlier", "demo.later"]);
  assert.deepEqual(result[0].children, base[0].children);
});

test("both module validators reject the removed layout configuration", () => {
  const base = { id: "demo", name: "Demo", version: "1", schemaVersion: 1, sdkVersion: 1 };
  for (const navigation of [{ regions: { right: ["system.edit"] } }, {}]) {
    assert.throws(() => validateCanvasConfig({ ...base, navigation }), /navigation/);
    assert.throws(() => validateSystemConfig({ ...base, navigation }), /navigation/);
  }
});

test("aggregate navigation isolates invalid packages and keeps system nodes ahead of negative orders", () => {
  const base = [{ id: "system.edit", name: "Edit", children: [] }];
  const packages = [
    { id: "first", menus: [{ id: "first.open", name: "Open", command: "first.run", order: -100 }] },
    { id: "bad", menus: [{ id: "system.edit", name: "Override", command: "bad.run" }] },
    { id: "foreign", menus: [{ id: "foreign.open", name: "Open", command: "foreign.run", parent: "first.open" }] },
    { id: "last", menus: [{ id: "last.open", name: "Open", command: "last.run", order: -200 }] }
  ];
  const result = assembleSystemNavigation(base, packages);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.nodes.map(node => node.id), ["system.edit", "last.open", "first.open"]);
});

test("system extension discovery is startup-only, isolated, optional and confined", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-system-"));
  try {
    const absent = new SystemExtensionLoader(path.join(root, "absent"));
    assert.deepEqual(await absent.snapshot(), []);
    await fs.mkdir(path.join(root, "demo"));
    const config = { id: "demo", name: "示例", desc: "", schemaVersion: 1, sdkVersion: 1, menus: [{ id: "demo.go", name: "执行", command: "demo.go" }], entry: "main.js" };
    await fs.writeFile(path.join(root, "demo/config.json"), JSON.stringify(config));
    await fs.writeFile(path.join(root, "demo/main.js"), "export function activate() {}");
    await fs.mkdir(path.join(root, "broken"));
    await fs.writeFile(path.join(root, "broken/config.json"), "bad json");
    const loader = new SystemExtensionLoader(root);
    const first = await loader.snapshot();
    assert.equal(first.filter(x => !x.error).length, 1);
    assert.equal(first.filter(x => x.error).length, 1);
    await fs.writeFile(path.join(root, "demo/main.js"), "changed");
    assert.equal((await loader.snapshot()).find(x => x.config?.id === "demo")!.source, "export function activate() {}");
    assert.equal((await new SystemExtensionLoader(root).snapshot()).find(x => x.config?.id === "demo")!.source, "changed");
    config.entry = "../outside.js";
    await fs.writeFile(path.join(root, "demo/config.json"), JSON.stringify(config));
    assert.ok((await new SystemExtensionLoader(root).snapshot()).find(x => x.folder === "demo")!.error);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("release sync removes deleted bundled extensions while preserving user additions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-release-"));
  const stage = path.join(root, "stage"), release = path.join(root, "release");
  try {
    await fs.mkdir(path.join(stage, "scripts/extensions/system_modules/demo"), { recursive: true });
    await fs.writeFile(path.join(stage, "scripts/extensions/system_modules/demo/config.json"), "{}");
    await syncRelease(stage, release);
    await fs.writeFile(path.join(release, "user-added.txt"), "keep");
    await fs.rm(path.join(stage, "scripts/extensions"), { recursive: true });
    await syncRelease(stage, release);
    await assert.rejects(fs.access(path.join(release, "scripts/extensions/system_modules/demo/config.json")));
    assert.equal(await fs.readFile(path.join(release, "user-added.txt"), "utf8"), "keep");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("opening a registered dock panel repeatedly focuses one instance", () => {
  const initial = createDockNode("inspector");
  const opened = openDockPanel(initial, "extension:demo.panel");
  const reopened = openDockPanel(opened, "extension:demo.panel");
  assert.equal(dockPanelCount(reopened, "extension:demo.panel"), 1);
});
