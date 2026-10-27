import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateNavigation, composeNavigation, CanvasNavigationContainer, SystemNavigationContainer, assembleSystemNavigation } from "../src/extensions/navigation";
import { SystemExtensionLoader } from "../src/extensions/system/loader";
import { syncRelease } from "../build/sync-release.cjs";
import { validateCanvasConfig } from "../src/extensions/canvas/config";
import { createDockNode, dockPanelCount, openDockPanel } from "../src/renderer/workspace/model";

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
  const config = validateCanvasConfig({ ...base, menus: [{ id: "demo.preference", name: "偏好", order: 20, action: { type: "openPanel", panel: "preferences.general", host: "settings" } }], navigation: { regions: { left: ["demo.preference"], right: ["system.edit"] } } });
  assert.equal(config.menus[0].action?.panel, "preferences.general");
  assert.deepEqual(config.navigation?.regions.right, ["system.edit"]);
  assert.throws(() => validateCanvasConfig({ ...base, navigation: { regions: { left: ["unknown.id"] } } }));
  assert.throws(() => validateCanvasConfig({ ...base, menus: [{ id: "demo.old", name: "旧入口", placement: "edit", command: "demo.run" }], entry: "index.js" }));
  assert.throws(() => validateCanvasConfig({ ...base, menus: [{ id: "demo.bad", name: "错误", parent: "system.missing", children: [] }] }));
});

test("navigation placement belongs to the container and supports validated layout overrides", () => {
  const nodes = [{ id: "system.edit", name: "编辑", children: [] }, { id: "demo.open", name: "打开", command: "demo.open" }];
  const canvas = new CanvasNavigationContainer().build(nodes);
  assert.equal(canvas.root.children!.length, 2);
  assert.deepEqual(canvas.regions.left, ["system.edit"]);
  assert.deepEqual(canvas.regions.right, ["demo.open"]);
  assert.equal("region" in nodes[1], false);
  const custom = new CanvasNavigationContainer().build(nodes, { regions: { left: ["demo.open"], right: ["system.edit"] } });
  assert.deepEqual(custom.regions.right, ["system.edit"]);
  assert.deepEqual(new SystemNavigationContainer().build(nodes).regions.left, ["system.edit", "demo.open"]);
  assert.throws(() => new CanvasNavigationContainer().build(nodes, { regions: { right: ["demo.missing"] } }));
  assert.throws(() => new CanvasNavigationContainer().build(nodes, { regions: { left: ["demo.open"], right: ["demo.open"] } }));
  assert.deepEqual(new CanvasNavigationContainer().build(nodes, { regions: { constructor: ["demo.open"] } }).regions.constructor, ["demo.open"]);
});

test("aggregate navigation limits isolate one contribution instead of crashing the system container", () => {
  const make = (id: string) => {
    const menus = Array.from({ length: 9 }, (_, index) => ({ id: id + ".node" + index, name: "菜单", command: id + ".run" }));
    return { id, menus, navigation: { regions: Object.fromEntries(menus.map((menu, index) => [id + index, [menu.id]])) } };
  };
  const result = assembleSystemNavigation([], [make("first"), make("second")]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.nodes.length, 9);
  assert.ok(result.nodes.every(node => node.id.startsWith("first.")));
  assert.doesNotThrow(() => new SystemNavigationContainer().build(result.nodes, result.layout));
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
