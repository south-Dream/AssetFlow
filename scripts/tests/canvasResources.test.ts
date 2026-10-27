import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceAPI,
  matchResourceRule,
  toResourceRef,
} from "../src/extensions/canvas/resources";
import { validateCanvasConfig } from "../src/extensions/canvas/config";
import { imageOutputSteps } from "../src/renderer/workspace/imageOutput";
import { finishImageEdit, imageDraftChanged } from "../src/renderer/workspace/imageEditing";
import {
  getCanvasPreferences,
  setCanvasPreferences,
} from "../src/renderer/workspace/canvasPreferences";
const asset = {
  id: "a",
  name: "a.PNG",
  format: "png",
  path: "C:/secret/a.png",
  root: "C:/secret",
  size: 10,
  width: 4,
  height: 4,
  thumbnail: "",
};
const rule = {
  extensions: ["png"],
  handler: "map.open",
  mode: "replace" as const,
  maxCount: 1,
};

test("tool drafts apply or cancel without exposing or mutating committed history", () => {
  const draft = {
    id: "crop",
    processor: "crop",
    enabled: true,
    params: { left: 0, top: 0, width: 64, height: 32 },
  };
  const document = {
    steps: [],
    activeStepId: "",
    editing: {
      draft,
      prefix: [],
      fresh: true,
      inputSize: { width: 256, height: 128 },
    },
    viewport: { scale: 1, panX: 0, panY: 0, locked: true },
  };
  assert.equal(finishImageEdit(document, false).steps.length, 0);
  assert.equal(finishImageEdit(document, true).steps[0].params.width, 64);
  assert.equal(finishImageEdit(document, true).activeStepId, "");
  assert.equal(document.steps.length, 0);
  assert.equal(imageDraftChanged(document), false);
  const tracked = { ...document, editing: { ...document.editing, initialParams: { width: 64, height: 32, top: 0, left: 0 }, dirty: true } };
  assert.equal(imageDraftChanged(tracked), false, "initialization and key order are not edits");
  tracked.editing.draft = { ...draft, params: { ...draft.params, width: 48 } };
  assert.equal(imageDraftChanged(tracked), true);
  tracked.editing.draft = draft;
  assert.equal(imageDraftChanged(tracked), false, "reverting parameters clears the switch prompt");
});

test("output format and filename are transient export choices after pixel operations", () => {
  const steps = [
    { id: "crop", processor: "crop", enabled: true, params: {} },
    {
      id: "old-format",
      processor: "convert",
      enabled: true,
      params: { format: "png" },
    },
  ];
  const output = imageOutputSteps(steps, {
    format: "webp",
    quality: 80,
    template: "game_{name}",
    background: "#ffffff",
  });
  assert.deepEqual(
    output.map((step) => step.processor),
    ["crop", "convert", "rename"]
  );
  assert.equal(output[1].params.format, "webp");
  assert.equal(output[2].params.template, "game_{name}");
  assert.equal(steps[1].params.format, "png");
});

test("canvas instance preferences isolate visibility, shortcuts and settings while preserving type defaults", () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const type = `test-${Date.now()}`;
    const first = getCanvasPreferences(type, "first");
    const second = getCanvasPreferences(type, "second");
    assert.notEqual(first, second);
    setCanvasPreferences(
      type,
      { visible: false, shortcuts: { brush: "B" }, settings: { size: 10 } },
      "first"
    );
    assert.equal(getCanvasPreferences(type, "first").visible, false);
    assert.equal(getCanvasPreferences(type, "second").visible, true);
    assert.deepEqual(getCanvasPreferences(type, "second").shortcuts, {});
    assert.deepEqual(getCanvasPreferences(type, "second").settings, {});
    assert.equal(getCanvasPreferences(type).visible, true);
    assert.ok(values.has(`assetflow.canvas.panel.first.${type}`));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as any).localStorage;
  }
});

test("resource matching is opt-in, batch strict and never exposes source filesystem paths", () => {
  const ref = toResourceRef(asset);
  assert.equal((ref as any).path, undefined);
  assert.equal(ref.mimeType, "image/png");
  assert.equal(matchResourceRule([], [ref]), undefined);
  assert.equal(matchResourceRule([rule], []), undefined);
  assert.equal(matchResourceRule([rule], [ref, ref]), undefined);
  assert.equal(
    matchResourceRule(
      [rule],
      [ref, { ...ref, extension: "mp3", mimeType: "audio/mpeg" }]
    ),
    undefined
  );
  assert.equal(matchResourceRule([rule], [ref])?.handler, "map.open");
  assert.equal(
    matchResourceRule(
      [{ ...rule, extensions: [], mimeTypes: ["image/*"] }],
      [ref]
    )?.handler,
    "map.open"
  );
});

test("resource rules validate module ownership, limits and require script entry", () => {
  const base = {
    schemaVersion: 1,
    sdkVersion: 1,
    id: "map",
    name: "Map",
    desc: "",
    version: "1",
  };
  assert.throws(
    () => validateCanvasConfig({ ...base, resources: [rule] }),
    /entry/
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...base,
      entry: "./index.js",
      resources: [{ ...rule, handler: "image.open" }],
    })
  );
  assert.throws(() =>
    validateCanvasConfig({
      ...base,
      entry: "./index.js",
      resources: [{ ...rule, mode: "overwrite" }],
    })
  );
  assert.equal(
    validateCanvasConfig({ ...base, entry: "./index.js", resources: [rule] })
      .resources?.[0].handler,
    "map.open"
  );
});

test("resource registry refuses absent implementations, honors async acceptance and cleans on replacement", async () => {
  const api = createResourceAPI([rule], async () => new ArrayBuffer(0));
  const ref = toResourceRef(asset);
  await assert.rejects(api.open([ref]), /未注册/);
  let opens = 0,
    disposes = 0;
  let accepted = true;
  api.registerHandler("map.open", {
    canAccept: async () => ({ accepted, reason: "业务拒绝" }),
    open: async () => {
      opens++;
    },
    dispose: async () => {
      disposes++;
    },
  });
  await api.open([ref]);
  assert.equal(opens, 1);
  accepted = false;
  await assert.rejects(api.open([ref]), /业务拒绝/);
  assert.equal(disposes, 0);
  assert.equal(opens, 1);
  accepted = true;
  await api.open([ref]);
  assert.equal(disposes, 1);
  assert.equal(opens, 2);
  await api.dispose();
  assert.equal(disposes, 2);
  assert.throws(() => api.registerHandler("system.open", {} as any));
});

test("append mode preserves a live document and binary reads require an active resource grant", async () => {
  const api = createResourceAPI(
    [{ ...rule, mode: "append" }],
    async () => new Uint8Array([1, 2]).buffer
  );
  let disposes = 0;
  api.registerHandler("map.open", {
    canAccept: () => true,
    open: async (refs) => {
      assert.equal((await api.read(refs[0].id)).byteLength, 2);
    },
    dispose: () => {
      disposes++;
    },
  });
  await assert.rejects(api.read("a"), /授权/);
  await api.open([toResourceRef(asset)]);
  await api.open([toResourceRef({ ...asset, id: "b" })]);
  assert.equal(disposes, 0);
  await api.dispose();
  await assert.rejects(api.read("a"), /授权/);
});
