import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import type { InferenceAdapter, ModelDefinition } from "../../../../../sdk/processing";
import manifest from "./config.json";

export interface RembgOptions {
  /** Absolute module directory containing runner.py, models/ and .venv/. */
  directory: string;
  python?: string;
  timeoutMs?: number;
}

// No shell interpolation. Diagnostics are bounded and cancellation kills Python.
export function runPython(python: string, args: string[], input: unknown,
  signal?: AbortSignal, timeoutMs = 120_000): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    if (child.pid) parentPort?.postMessage({ type: "inference-process", pid: child.pid });
    let stdout = "", stderr = "", failure: Error | undefined;
    const abort = () => { failure = new Error("Inference cancelled"); child.kill(); };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { failure = new Error("Inference timed out"); child.kill(); }, timeoutMs);
    child.stdout.on("data", chunk => { stdout = (stdout + chunk.toString()).slice(-8192); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    child.stdin.on("error", () => {});
    child.on("error", error => { failure = error; });
    child.on("close", code => {
      if (child.pid) parentPort?.postMessage({ type: "inference-process-exit", pid: child.pid });
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(Error(`rembg exited (${code}): ${stderr}`));
      else resolve(stdout);
    });
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}

export function createRembgAdapter(options: RembgOptions): InferenceAdapter {
  const directory = path.resolve(options.directory);
  const python = options.python ?? path.join(directory, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const runner = path.join(directory, "runner.py");
  const find = (model: ModelDefinition) => manifest.models.find(item => item.id === model.id &&
    model.artifact.path === `models/${item.file}` && model.artifact.checksum === item.checksum);
  return {
    id: manifest.adapter,
    apiVersion: 1,
    supports: model => model.version === 1 && model.task === manifest.capability && !!find(model),
    async load(model, context, signal) {
      const config = find(model);
      if (!config) throw Error("Model requires a different rembg adapter configuration");
      context.checkCancelled();
      const modelFile = path.join(directory, "models", config.file);
      const data = await fs.readFile(modelFile).catch(() => {
        throw Error(`缺少抠图模型：请将 ${config.file} 放到 ${path.dirname(modelFile)}。安装说明：${directory}/README.md`);
      });
      const [algorithm, expected] = config.checksum.split(":");
      if (createHash(algorithm).update(Uint8Array.from(data)).digest("hex") !== expected)
        throw Error(`Model checksum mismatch: ${modelFile}`);
      try {
        const status = JSON.parse(await runPython(python, [runner, "--check"], undefined, signal, options.timeoutMs));
        if (status.ready !== true) throw Error("Invalid runtime response");
      } catch (error) { throw Error(`rembg 运行环境不可用：${String(error)}。安装说明：${directory}/README.md`); }
      let disposed = false;
      return {
        async execute(inputs, params, execution, abortSignal) {
          if (disposed) throw Error("rembg session disposed");
          execution.checkCancelled();
          const input = inputs.image?.[0]?.data;
          if (!(input instanceof Uint8Array)) throw Error("rembg expects image data as Uint8Array");
          const tempRoot = path.join(directory, "temp");
          await fs.mkdir(tempRoot, { recursive: true });
          const work = await fs.mkdtemp(path.join(tempRoot, "job-"));
          try {
            // Normalize orientation and reject excessive dimensions before Python.
            const source = await sharp(input, { limitInputPixels: 100_000_000 }).rotate().png().toBuffer();
            await fs.writeFile(path.join(work, "input.png"), Uint8Array.from(source));
            const response = JSON.parse(await runPython(python, [runner], {
              models: path.join(directory, "models"), session: config.session,
              input: path.join(work, "input.png"), output: path.join(work, "output.png"),
              mask: path.join(work, "mask.png"), params,
            }, abortSignal, options.timeoutMs));
            if (response.ok !== true) throw Error("Invalid rembg response");
            execution.checkCancelled();
            const [image, mask] = await Promise.all([fs.readFile(path.join(work, "output.png")), fs.readFile(path.join(work, "mask.png"))]);
            const original = await sharp(source).metadata();
            for (const bytes of [image, mask]) {
              const info = await sharp(bytes).metadata();
              if (info.format !== "png" || info.width !== original.width || info.height !== original.height)
                throw Error("Invalid rembg output dimensions or format");
            }
            return { image: [{ kind: "image", data: image }], mask: [{ kind: "mask", data: mask }] };
          } finally { await fs.rm(work, { recursive: true, force: true }); }
        },
        async dispose() { disposed = true; },
      };
    },
  };
}
