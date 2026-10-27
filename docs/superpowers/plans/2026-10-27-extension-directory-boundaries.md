# Extension directory correction

**Goal:** Keep implementation of image operations and rembg under the owning Canvas module; keep host extension integration under scripts/src/extensions.

**Architecture:** scripts/extensions/canvas_moudles/image/modules contains processing and background-removal. Public SDK is outside src. scripts/src/extensions/canvas and system own host validation/loaders; adapters bind trusted builtins to core without exposing Node to external sandbox modules.

- [x] Test module-owned runtime path and packaging exclusion of private Python/model caches.
- [x] Move business module code, config and Python environment without deleting local artifacts.
- [x] Consolidate host extension code under scripts/src/extensions/canvas and system; add explicit builtin adapters.
- [x] Update imports, worker paths, packaging and documentation; retain supported Canvas association migration.
- [x] Verify build, unit/UI checks and actual release EXE.

No git repository is available. Keep source extensions next to src, not nested inside it. Use modules spelling consistently for business submodules; preserve existing canvas_moudles compatibility spelling.

验证：68项单元测试、6组Electron界面检查及真实release EXE检查通过；迁移后的Python runner --check返回ready；便携版和安装资源暂存均包含模块内runner/config且排除本地虚拟环境及权重缓存。
