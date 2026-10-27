# System extensions and shared navigation

**Goal:** Startup-discovered system extensions, protected builtin navigation, shared Canvas navigation protocol and reusable panel hosts.

**Architecture:** A common navigation validator/composer merges additive contributions by stable parent ID. System extension snapshots load once from scripts/extensions/system_modules; Canvas extensions retain manager lifecycle. Panels support form or isolated script rendering, mounted as settings, dialog or dock content.

**Tech Stack:** Electron, React, TypeScript, JSON, existing opaque iframe isolation.

- [x] Add regression tests for namespace protection, nested contributions, startup snapshots, missing directories and broken-module isolation.
- [x] Implement shared navigation contracts/composer; adapt Canvas config and toolbar without breaking existing placement configs.
- [x] Add startup system loader, constrained bridge, isolated runtime and panel lifecycle with persistent shared values.
- [x] Move Canvas authoring tree under extensions with legacy installed-path fallback; package extensions in release.
- [x] Wire protected builtin menu definitions, settings and dock/dialog panel hosts. Add working preferences example and SDK/docs.
- [x] Run unit/UI/packaged EXE checks and update release.

User approved implementation in chat. No git repository is available; changes stay in the shared workspace.

验证：类型检查与构建通过；66 项单元测试通过；6 组隐藏 Electron 界面检查通过；release/AssetFlow.exe 真实打包检查通过，涵盖图片拖入、独立导航按钮、三级菜单、脚本命令、设置页面与自定义停靠面板。
