# Clean extension distribution and uniform navigation

**Goal:** All menu triggers share one visual rule; examples never ship as built-in features; external extension fixtures live under test/extensions.

- [x] Add and run a failing UI assertion comparing direct buttons to menu triggers.
- [x] Unify navigation trigger style and move demonstration packages to test/extensions.
- [x] Update tests and docs to explicitly load external fixtures; packaged EXE must start without examples.
- [x] Clarify requested scripts layout and pkg/remconfig format before dependent restructuring.
- [x] Build, run unit/UI/EXE checks and update release.

用户澄清pkgmgr指config目录关联与卸载；新增回收站卸载，失败回滚注册。源码采用scripts/src、scripts/extensions、scripts/build、scripts/tests。示例独立test/extensions，未加入正式目录。验证：70单测、6组界面检查、默认EXE无示例、隔离EXE手动合并示例与统一按钮样式均通过。历史release/canvas_moudles已归档到.cache，避免保留旧演示包。
