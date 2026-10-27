# 项目脚本目录

```text
scripts/
├─ src/          核心、Electron 主进程、界面与扩展宿主
├─ extensions/   正式扩展、公开 SDK 和内置图片能力
├─ build/        开发启动、编译、资源准备与发布工具
└─ tests/        单元测试、界面检查与 EXE 验证脚本
```

根目录 `test/extensions/` 仅提供手动接入练习包，不在默认扩展扫描或发布范围内。SDK 的正式用法见 `extensions/docs/README.md`。

所有命令在工程根目录执行：

| 命令 | 入口与用途 |
|---|---|
| npm run dev | build/dev.cjs：启动开发应用 |
| npm run build | build/build.cjs + Vite：编译到 dist |
| npm test | tests/test.cjs：运行单元测试 |
| npm run test:smoke | tests/run-smoke.cjs：运行隔离的 Electron 界面检查 |
| npm run package | build/package-local.cjs：更新同一个 release 目录 |
| npm run make | build/prepare-runtime.cjs + Forge：生成安装包 |
| powershell -File scripts/tests/packaged-smoke.ps1 | 启动真实 EXE 验证默认布局与图片处理 |

`node_modules` 是 npm 安装的依赖，`package.json`、锁文件和工具配置留在根目录；它们不是业务脚本。`dist`、`release`、`.cache`、`.test-build` 是生成物，不能作为源码修改。不会把 Node 依赖和生成缓存搬进核心源码。
