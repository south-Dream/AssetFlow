import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { definitions, validateSteps } from "../src/core/registry";
import { processImage } from "../extensions/canvas_moudles/image/modules/processing/process";
import type { Step } from "../src/shared";
import { writeUnique, zipDirectory } from "../src/services/output";
const step = (processor: string, params: Record<string, any> = {}): Step => ({
  id: processor,
  processor,
  enabled: true,
  params: {
    ...Object.fromEntries(
      definitions
        .find((d) => d.id === processor)!
        .fields.map((f) => [f.key, f.default]),
    ),
    ...params,
  },
});
async function fixture(run: (file: string, dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-test-"));
  try {
    const file = path.join(dir, "sample.png");
    await sharp({
      create: { width: 10, height: 8, channels: 4, background: "#ff0000" },
    })
      .png()
      .toFile(file);
    await run(file, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("registry rejects malformed and unknown parameters", () => {
  assert.equal(definitions.length, 8);
  assert.throws(() => validateSteps([step("resize", { width: 0 })]));
  assert.throws(() => validateSteps([step("trim", { threshold: 256 })]));
  assert.throws(() =>
    validateSteps([{ id: "x", processor: "shell", enabled: true }]),
  );
  assert.throws(() => validateSteps([step("rotate", { background: "evil" })]));
});
test("resize → crop → rotate follows exact step order and preserves source", () =>
  fixture(async (file) => {
    const original = await fs.readFile(file);
    const result = await processImage(file, [
      step("resize", { mode: "exact", width: 20, height: 16 }),
      step("crop", { left: 4, top: 2, width: 12, height: 10 }),
      step("rotate", { angle: 90 }),
    ]);
    assert.equal(result.width, 10);
    assert.equal(result.height, 12);
    assert.deepEqual(await fs.readFile(file), original);
    await assert.rejects(
      processImage(file, [
        step("crop", { width: 12, height: 10 }),
        step("resize", { mode: "exact", width: 20, height: 16 }),
      ]),
      /超出/,
    );
  }));
test("disabled operations are ignored", () =>
  fixture(async (file) => {
    const s = step("resize");
    s.enabled = false;
    assert.equal((await processImage(file, [s])).width, 10);
  }));

test("removing saved pipeline steps recalculates from the unchanged source", () =>
  fixture(async (file) => {
    const source = await fs.readFile(file);
    const saved = [
      step("resize", { mode: "exact", width: 20, height: 16 }),
      step("crop", { left: 0, top: 0, width: 12, height: 10 }),
    ];
    assert.equal((await processImage(file, saved)).width, 12);
    assert.equal(
      (
        await processImage(
          file,
          saved.filter((s) => s.processor !== "crop"),
        )
      ).width,
      20,
    );
    await assert.rejects(
      processImage(
        file,
        saved.filter((s) => s.processor !== "resize"),
      ),
      /超出/,
    );
    assert.equal((await processImage(file, [])).width, 10);
    assert.deepEqual(await fs.readFile(file), source);
  }));
test("trim uses Alpha threshold, preserves margin and handles empty Alpha", () =>
  fixture(async (_, dir) => {
    const file = path.join(dir, "trim.png");
    await sharp({
      create: { width: 10, height: 8, channels: 4, background: "#00000000" },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 4, height: 2, channels: 4, background: "#ffffff" },
          })
            .png()
            .toBuffer(),
          left: 3,
          top: 2,
        },
      ])
      .png()
      .toFile(file);
    const result = await processImage(file, [step("trim", { padding: 1 })]);
    assert.equal(result.width, 6);
    assert.equal(result.height, 4);
    const empty = path.join(dir, "empty.png");
    await sharp({
      create: { width: 10, height: 8, channels: 4, background: "#00000000" },
    })
      .png()
      .toFile(empty);
    const unchanged = await processImage(empty, [step("trim")]);
    assert.equal(unchanged.width, 10);
    assert.equal(unchanged.warnings.length, 1);
  }));
test("canvas adds padding and rejects undersized targets", () =>
  fixture(async (file) => {
    const result = await processImage(file, [
      step("canvas", { mode: "padding", padding: 2 }),
    ]);
    assert.equal(result.width, 14);
    assert.equal(result.height, 12);
    await assert.rejects(
      processImage(file, [step("canvas", { width: 1, height: 1 })]),
      /画布/,
    );
  }));
test("JPEG conversion flattens transparency against configured background", () =>
  fixture(async (_, dir) => {
    const file = path.join(dir, "alpha.png");
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: "#00000000" },
    })
      .png()
      .toFile(file);
    const result = await processImage(file, [
      step("convert", { format: "jpeg", background: "#ffffff", quality: 100 }),
    ]);
    assert.equal(result.format, "jpeg");
    const m = await sharp(result.buffer).metadata();
    assert.equal(m.hasAlpha, false);
    const { data } = await sharp(result.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > 250 && data[1] > 250 && data[2] > 250);
  }));
test("rename templates reflect batch index and current dimensions", () =>
  fixture(async (file) => {
    const result = await processImage(
      file,
      [
        step("rename", {
          template: "{name}_{index}_{width}x{height}",
          prefix: "ui_",
          start: 1,
          digits: 3,
        }),
      ],
      2,
    );
    assert.equal(result.name, "ui_sample_003_10x8.png");
    await assert.rejects(
      processImage(file, [step("rename", { template: "../escape" })]),
      /不合法/,
    );
  }));
test("WebP conversion and cancellation boundary", () =>
  fixture(async (file) => {
    assert.equal(
      (await processImage(file, [step("convert", { format: "webp" })])).format,
      "webp",
    );
    await assert.rejects(
      processImage(file, [step("resize")], 0, () => {
        throw Error("cancelled");
      }),
      /cancelled/,
    );
  }));

test("exclusive output preserves originals and supports concurrent name collisions", () =>
  fixture(async (file, dir) => {
    const source = await fs.readFile(file),
      reserved = new Set<string>(),
      protectedPaths = new Set([file.toLowerCase()]);
    const signal = new AbortController().signal;
    const outputs = await Promise.all(
      Array.from({ length: 4 }, () =>
        writeUnique(
          dir,
          "sample.png",
          Buffer.from("new"),
          protectedPaths,
          reserved,
          signal,
        ),
      ),
    );
    assert.equal(new Set(outputs).size, 4);
    assert.deepEqual(await fs.readFile(file), source);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      writeUnique(
        dir,
        "cancel.png",
        source,
        protectedPaths,
        reserved,
        cancelled.signal,
      ),
    );
    await assert.rejects(
      writeUnique(
        dir,
        "../outside.png",
        source,
        protectedPaths,
        reserved,
        signal,
      ),
    );
  }));
test("ZIP export creates valid ZIP signature without replacing an existing archive", () =>
  fixture(async (_, dir) => {
    const output = path.join(dir, "exports");
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, "AssetFlow.zip"), "existing");
    const source = path.join(dir, "payload");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "hello.txt"), "hello");
    const result = await zipDirectory(
      source,
      output,
      new AbortController().signal,
    );
    assert.equal(path.basename(result), "AssetFlow_1.zip");
    assert.equal((await fs.readFile(result)).subarray(0, 2).toString(), "PK");
    assert.equal(
      await fs.readFile(path.join(output, "AssetFlow.zip"), "utf8"),
      "existing",
    );
  }));

import { ProcessorRegistry } from "../src/core/framework/registry";
import { ModelRegistry } from "../src/core/framework/models";
import {
  InferenceService,
  type InferenceAdapter,
} from "../src/core/framework/inference";
import { createBackgroundRemoval } from "../extensions/canvas_moudles/image/modules/background-removal/index";
import { runPython } from "../extensions/canvas_moudles/image/modules/background-removal/rembg/adapter";
import { processingRegistry } from "../extensions/canvas_moudles/image/modules/processing/processors/index";
import type { Context } from "../extensions/canvas_moudles/image/modules/processing/processors/types";
const execution = { checkCancelled() {}, reportProgress() {}, log() {} };

test("generic registry supports collection inputs, multiple outputs and rejects invalid boundaries", async () => {
  const registry = new ProcessorRegistry();
  const module = {
    id: "test",
    processors: [
      {
        definition: {
          id: "split",
          module: "test",
          version: 1,
          name: "Split",
          description: "",
          fields: [],
          inputs: [{ id: "sources", kind: "audio", multiple: true }],
          outputs: [
            { id: "left", kind: "audio" },
            { id: "right", kind: "audio" },
          ],
        },
        async execute() {
          return {
            left: [{ kind: "audio", data: "left.wav" }],
            right: [{ kind: "audio", data: "right.wav" }],
          };
        },
      },
    ],
  };
  registry.register(module);
  const inputs = {
    sources: [
      { kind: "audio", data: "a.wav" },
      { kind: "audio", data: "b.wav" },
    ],
  };
  assert.equal(
    (await registry.execute("split", inputs, {}, execution)).right[0].data,
    "right.wav",
  );
  assert.throws(() => registry.register(module));
  await assert.rejects(
    registry.execute(
      "split",
      { sources: [{ kind: "image", data: null }] },
      {},
      execution,
    ),
  );
  await assert.rejects(registry.execute("split", inputs, {}, execution, 2));
  await assert.rejects(
    registry.execute(
      "split",
      inputs,
      {},
      {
        ...execution,
        checkCancelled() {
          throw Error("cancelled");
        },
      },
    ),
  );
  const broken = new ProcessorRegistry();
  broken.register({
    id: "test",
    processors: [
      {
        ...module.processors[0],
        async execute() {
          return {};
        },
      },
    ],
  });
  await assert.rejects(broken.execute("split", inputs, {}, execution));
});

test("image adapter isolates branches and updates output metadata", () =>
  fixture(async (file) => {
    const image = await fs.readFile(file);
    const source: Context = {
      image,
      width: 10,
      height: 8,
      format: "png",
      quality: 90,
      background: "#ffffff",
      name: "sample",
      index: 0,
      warnings: [],
    };
    const inputs = { image: [{ kind: "image", data: source }] };
    const resized = await processingRegistry.execute(
      "resize",
      inputs,
      { mode: "exact", width: 20, height: 16 },
      execution,
    );
    const renamed = await processingRegistry.execute(
      "rename",
      inputs,
      { prefix: "ui_" },
      execution,
    );
    assert.equal((resized.image[0].data as Context).width, 20);
    assert.equal((renamed.image[0].data as Context).width, 10);
    assert.equal(source.name, "sample");
    assert.equal(source.width, 10);
    assert.deepEqual(source.image, image);
  }));

test("model configuration selects compatible adapters and validates defaults and overrides", () => {
  const registry = new ModelRegistry();
  const model = {
    id: "example",
    name: "Example",
    description: "",
    version: 1,
    task: "remove-background",
    adapter: "test-runtime",
    artifact: { path: "model.onnx", checksum: "example" },
    fields: [
      {
        key: "threshold",
        label: "Threshold",
        type: "number" as const,
        default: 0.5,
        min: 0,
        max: 1,
      },
    ],
    defaults: { threshold: 0.7 },
  };
  registry.registerModel(model);
  assert.deepEqual(registry.available(model.task), []);
  registry.registerAdapter({ id: "test-runtime", supports: () => true });
  assert.equal(registry.available(model.task).length, 1);
  assert.equal(registry.resolve(model.id, model.task).params.threshold, 0.7);
  assert.equal(
    registry.resolve(model.id, model.task, { threshold: 0.2 }).params.threshold,
    0.2,
  );
  assert.throws(() => registry.resolve(model.id, "upscale"));
  assert.throws(() => registry.resolve(model.id, model.task, { threshold: 2 }));
  assert.throws(() =>
    registry.registerModel({ ...model, id: "bad", defaults: { threshold: 2 } }),
  );
});

test("legacy steps gain versions and reject incompatible versions", () => {
  assert.equal(validateSteps([step("resize")])[0].processorVersion, 1);
  assert.throws(() =>
    validateSteps([{ ...step("resize"), processorVersion: 2 }]),
  );
  assert.throws(() => validateSteps([{ ...step("resize"), params: [] }]));
});

test("inference service serializes tasks, validates ports and releases failed sessions", async () => {
  const registry = new ModelRegistry<InferenceAdapter>();
  let active = 0,
    peak = 0,
    disposed = 0;
  registry.registerAdapter({
    id: "fake",
    apiVersion: 1,
    supports: () => true,
    async load() {
      active++;
      peak = Math.max(peak, active);
      return {
        async execute(inputs, params) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          if (params.fail) throw Error("inference failure");
          return inputs;
        },
        async dispose() {
          active--;
          disposed++;
        },
      };
    },
  });
  registry.registerModel({
    id: "fake",
    name: "Fake",
    description: "",
    version: 1,
    task: "test",
    adapter: "fake",
    artifact: { path: "fake", checksum: "fake" },
    fields: [{ key: "fail", label: "Fail", type: "boolean", default: false }],
    defaults: {},
  });
  const service = new InferenceService(registry, [
    {
      id: "test",
      version: 1,
      inputs: [{ id: "image", kind: "image" }],
      outputs: [{ id: "image", kind: "image" }],
    },
  ]);
  const request = {
    capability: "test",
    version: 1,
    model: "fake",
    inputs: { image: [{ kind: "image", data: "test" }] },
  };
  const results = await Promise.allSettled([
    service.execute({ ...request, params: { fail: true } }, execution),
    service.execute(request, execution),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(peak, 1);
  assert.equal(disposed, 2);
  await assert.rejects(service.execute({ ...request, version: 2 }, execution));
  await assert.rejects(service.execute({ ...request, inputs: {} }, execution));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.execute(request, execution, controller.signal));
  assert.equal(disposed, 2);
});

test("rembg module reports missing local models without downloading", () =>
  fixture(async (_, dir) => {
    const { service, models } = createBackgroundRemoval({ directory: dir });
    assert.equal(
      models.available("image.remove-background")[0].id,
      "rembg.u2netp",
    );
    await assert.rejects(
      service.execute(
        {
          capability: "image.remove-background",
          version: 1,
          model: "rembg.u2netp",
          inputs: { image: [{ kind: "image", data: new Uint8Array() }] },
        },
        execution,
      ),
      /缺少抠图模型/,
    );
    await fs.mkdir(path.join(dir, "models"));
    await fs.writeFile(path.join(dir, "models", "u2netp.onnx"), "corrupt");
    await assert.rejects(
      service.execute(
        {
          capability: "image.remove-background",
          version: 1,
          model: "rembg.u2netp",
          inputs: { image: [{ kind: "image", data: new Uint8Array() }] },
        },
        execution,
      ),
      /checksum mismatch/,
    );
  }));

test("adapter process transport handles missing executables, cancellation and timeout", async () => {
  await assert.rejects(
    runPython("assetflow-nonexistent-python", [], undefined),
  );
  const controller = new AbortController();
  const running = runPython(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    undefined,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(running, /cancelled/);
  await assert.rejects(
    runPython(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      undefined,
      undefined,
      30,
    ),
    /timed out/,
  );
});

test("background removal is available in presets and the shared preview/export pipeline", () =>
  fixture(async (file) => {
    const definition = definitions.find((d) => d.id === "remove-background")!;
    assert.ok(definition);
    assert.equal(
      validateSteps([step("remove-background")])[0].params.model,
      "rembg.u2netp",
    );
    assert.throws(() =>
      validateSteps([step("remove-background", { model: "unknown" })]),
    );
    const previous = process.env.ASSETFLOW_REMBG_DIRECTORY;
    process.env.ASSETFLOW_REMBG_DIRECTORY = path.join(
      path.dirname(file),
      "not-installed",
    );
    try {
      await assert.rejects(
        processImage(file, [step("remove-background")]),
        /缺少抠图模型/,
      );
      const disabled = step("remove-background");
      disabled.enabled = false;
      assert.equal((await processImage(file, [disabled])).width, 10);
    } finally {
      if (previous === undefined) delete process.env.ASSETFLOW_REMBG_DIRECTORY;
      else process.env.ASSETFLOW_REMBG_DIRECTORY = previous;
    }
  }));
