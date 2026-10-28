// Build an unpack-and-run Windows folder from the already installed runtime.
// Sharp uses Node-API; its platform binaries are preserved and unpacked from ASAR.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
async function main() {
  const root = process.cwd();
  const stage = path.resolve(".cache/local-package");
  const output = path.resolve(".cache/release-package");
  const destination = path.resolve("release");
  for (const target of [stage, output]) {
    if (!target.startsWith(root + path.sep))
      throw Error("Unexpected build directory");
    await fs.rm(target, { recursive: true, force: true });
  }
  await fs.mkdir(stage, { recursive: true });
  await fs.cp("dist", path.join(stage, "dist"), { recursive: true });
  const pkg = require("../../package.json");
  await fs.writeFile(
    path.join(stage, "package.json"),
    JSON.stringify({
      name: pkg.name,
      productName: pkg.productName,
      version: pkg.version,
      main: pkg.main,
      dependencies: pkg.dependencies,
    })
  );
  const paths = execFileSync(
    "cmd.exe",
    ["/d", "/s", "/c", "npm ls --omit=dev --all --parseable"],
    { encoding: "utf8" }
  )
    .trim()
    .split(/\r?\n/)
    .slice(1);
  for (const dependency of new Set(paths)) {
    const relative = path.relative(root, dependency);
    if (!relative.startsWith("node_modules" + path.sep))
      throw Error("Unexpected dependency path");
    await fs.cp(dependency, path.join(stage, relative), { recursive: true });
  }
  const runtime = path.join(
    path.dirname(require.resolve("electron/package.json")),
    "dist"
  );
  await fs.cp(runtime, output, { recursive: true });
  await fs.cp("scripts/extensions", path.join(output, "scripts/extensions"), {
    recursive: true,
    filter: source => require("./extension-assets.cjs").includeExtensionAsset("scripts/extensions", source),
  });
  await fs.rm(path.join(output, "resources/default_app.asar"), { force: true });
  await asar.createPackageWithOptions(
    stage,
    path.join(output, "resources/app.asar"),
    { unpackDir: path.join("node_modules", "@img") }
  );
  await fs.rename(
    path.join(output, "electron.exe"),
    path.join(output, "AssetFlow.exe")
  );
  const builtAt = new Date();
  await fs.utimes(path.join(output, "AssetFlow.exe"), builtAt, builtAt);
  await fs.writeFile(
    path.join(output, "BUILD_INFO.json"),
    JSON.stringify(
      {
        name: pkg.productName,
        version: pkg.version,
        builtAt: builtAt.toISOString(),
        features: [
          "canvas-module-manager",
          "resource-handler-sdk",
          "unified-settings",
          "startup-system-extensions",
          "shared-additive-navigation",
          "single-row-system-first-navigation",
          "compact-package-manager",
          "flat-settings-pages",
          "extension-panel-hosts",
        "inspector-fields-and-drawers",
        ],
      },
      null,
      2
    )
  );
  if (!destination.startsWith(root + path.sep)) throw Error("Unexpected release directory");
  if (process.platform === "win32") {
    const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$target = [Environment]::GetEnvironmentVariable('ASSETFLOW_RELEASE_EXE'); @((Get-Process AssetFlow -ErrorAction SilentlyContinue) | Where-Object { $_.Path -and [string]::Equals($_.Path, $target, [StringComparison]::OrdinalIgnoreCase) }).Count"], { encoding: "utf8", windowsHide: true, env: { ...process.env, ASSETFLOW_RELEASE_EXE: path.join(destination, "AssetFlow.exe") } }).trim();
    if (Number(running) > 0) throw Error("请先关闭 release/AssetFlow.exe 再重新打包。新构建已准备在 .cache/release-package，不会创建其他发布目录。");
  }
  await fs.mkdir(destination, { recursive: true });
  await require("./sync-release.cjs").syncRelease(output, destination);
  console.log("Windows application:", path.join(destination, "AssetFlow.exe"));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
