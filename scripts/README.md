# 项目脚本目录

```text
scripts/
├─ src/          核心、Electron 主进程、界面与扩展宿主
├─ extensions/   正式扩展、公开 SDK 和预装图片/图集能力
└─ build/        开发启动、编译、资源准备与发布工具
```

根目录 `examples/extensions/` 仅提供手动接入练习包，不在默认扩展扫描或发布范围内。SDK 的正式用法见 `extensions/docs/README.md`。

自动化检查已集中在根目录 `tests/`，每个文件用途见 [检查索引](../tests/README.md)；可安装示例和系统导航入口见 [示例说明](../examples/README.md)。正式画布目录统一拼写为 `canvas_modules`。

所有命令在工程根目录执行：

| 命令 | 入口与用途 |
|---|---|
| npm run dev | build/dev.cjs：启动开发应用 |
| npm run build | build/build.cjs + Vite：编译到 dist |
| npm test | 根目录 tests/test.cjs：自动发现并运行单元测试 |
| npm run test:smoke | 根目录 tests/run-smoke.cjs：运行隔离的 Electron 界面检查 |
| npm run package | build/package-local.cjs：更新同一个 release 目录 |
| npm run make | build/prepare-runtime.cjs + Forge：生成安装包 |
| powershell -File tests/packaged-smoke.ps1 | 启动真实 EXE 验证默认布局与图片处理 |

`node_modules` 是 npm 安装的依赖，`package.json`、锁文件和工具配置留在根目录；它们不是业务脚本。`dist`、`release`、`.cache`、`.test-build` 是生成物，不能作为源码修改。不会把 Node 依赖和生成缓存搬进核心源码。
