# Shared navigation containers and compact management panels

**Goal:** Shared recursive NavNode tree with container-owned region layout; direct package/settings actions; flat settings pages and compact package list.

**Architecture:** SDK defines NavNode, NavigationLayout and container contracts. Core container builders validate stable root IDs and distribute nodes by region. One renderer is used by system and Canvas; trusted hosts can override region rendering, Canvas config can override region assignments. Builtin child menus are fixed; external extensions add top-level trees only.

- [x] Add tests for fixed builtin children, region routing and invalid layout bindings.
- [x] Implement shared contracts/builders/renderer and expose Canvas layout configuration.
- [x] Flatten system navigation; Canvas settings directly opens one combined page.
- [x] Replace package cards with selectable rows, footer add button and context actions.
- [x] Replace nested settings navigation with one flat page list and shared settings container.
- [x] Update external fixtures/docs, unit/UI checks, review and package real EXE.

User approved implementation and tightened builtin submenu extension rules in chat. No git repository is available.

验证：类型检查、生产构建、72项单元测试、7组Electron界面检查通过。实际渲染检查并修正设置左侧竖向布局及复选框对齐。真实release EXE默认启动、包列表、两栏设置、图片处理，以及隔离副本手动合并测试扩展后的按钮/命令验证均通过。独立只读复核发现的累计区域超限白屏已修复并有回归测试。
