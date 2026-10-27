const { spawn } = require("node:child_process");
const build = require("./build.cjs");
async function main() {
  await build();
  const { createServer } = await import("vite");
  const server = await createServer();
  await server.listen();
  const child = spawn(require("electron"), ["."], {
    stdio: "inherit",
    env: { ...process.env, ASSETFLOW_DEV: "1" },
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    child.kill();
    await server.close();
  };
  child.on("exit", async (code) => {
    await stop();
    process.exitCode = code || 0;
  });
  child.on("error", async (e) => {
    console.error(e);
    await stop();
    process.exitCode = 1;
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
