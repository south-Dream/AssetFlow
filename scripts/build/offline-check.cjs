// Optional fallback when dependencies cannot be downloaded. Uses a locally available TypeScript.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require(process.env.ASSETFLOW_TYPESCRIPT || "typescript");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : /\.(ts|tsx)$/.test(e.name)
        ? [path.join(dir, e.name)]
        : []
    );
}
let failures = 0;
for (const file of [...files("scripts/src"), ...files("scripts/tests"), "vite.config.ts"]) {
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  for (const d of result.diagnostics || []) {
    console.error(file, ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    failures++;
  }
}
const js = ts.transpileModule(fs.readFileSync("scripts/src/core/registry.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", js)(mod, mod.exports);
const { definitions, validateSteps } = mod.exports;
const step = (processor, params = {}) => ({
  id: "test",
  processor,
  enabled: true,
  params,
});
assert.equal(definitions.length, 7);
assert.equal(new Set(definitions.map((d) => d.id)).size, 7);
for (const d of definitions)
  assert.equal(validateSteps([step(d.id)])[0].processor, d.id);
for (const input of [
  null,
  {},
  [step("unknown")],
  [step("resize", { width: 0 })],
  [step("resize", { width: Infinity })],
  [step("rotate", { background: "red" })],
  [step("trim", { threshold: 256 })],
  [step("resize", { kernel: "invalid" })],
  [step("rename", { prefix: 4 })],
])
  assert.throws(() => validateSteps(input));
console.log(
  `Syntax: ${failures} errors. Registry: 7 defaults and 9 invalid-input checks passed.`
);
process.exitCode = failures ? 1 : 0;
async function checkOutput() {
  const js = ts.transpileModule(
    fs.readFileSync("scripts/src/services/output.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }
  ).outputText;
  const output = { exports: {} };
  new Function("require", "module", "exports", js)(
    require,
    output,
    output.exports
  );
  const { writeUnique } = output.exports;
  const base = path.resolve(".test-build");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "output-check-"));
  try {
    const controller = new AbortController();
    const source = path.join(directory, "source.png");
    fs.writeFileSync(source, "original");
    const protectedPaths = new Set([source.toLowerCase()]),
      reserved = new Set();
    const first = await writeUnique(
      directory,
      "source.png",
      Buffer.from("processed"),
      protectedPaths,
      reserved,
      controller.signal
    );
    assert.notEqual(first, source);
    assert.equal(fs.readFileSync(source, "utf8"), "original");
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        writeUnique(
          directory,
          "same.png",
          Buffer.from("data"),
          protectedPaths,
          reserved,
          controller.signal
        )
      )
    );
    assert.equal(new Set(results).size, 8);
    for (const file of results)
      assert.equal(fs.readFileSync(file, "utf8"), "data");
    controller.abort();
    await assert.rejects(
      writeUnique(
        directory,
        "cancelled.png",
        Buffer.from("x"),
        protectedPaths,
        reserved,
        controller.signal
      )
    );
    assert.equal(fs.existsSync(path.join(directory, "cancelled.png")), false);
    await assert.rejects(
      writeUnique(
        directory,
        "../escape.png",
        Buffer.from("x"),
        protectedPaths,
        reserved,
        new AbortController().signal
      )
    );
    console.log(
      "Output: source protection, 8 concurrent collisions, cancellation and path traversal checks passed."
    );
  } finally {
    if (!path.resolve(directory).startsWith(base + path.sep))
      throw Error("Unexpected cleanup path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
checkOutput().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
