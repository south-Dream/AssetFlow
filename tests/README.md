# 自动化检查：从这里开始

这里的文件由开发命令运行，**不是可安装的扩展包**。想看测试画布或测试导航，请去 [examples](../examples/README.md)。所有命令在项目根目录执行。

| 命令 | 用途 |
| --- | --- |
| `npm test` | 单元测试和保存协议检查，改逻辑后运行 |
| `npm run test:smoke` | 先构建，再启动隐藏 Electron 窗口检查真实界面 |
| `npm run test:package` | 检查已构建的 `release/AssetFlow.exe`；先运行 `npm run package` |

## 单元测试

| 文件 | 检查什么 |
| --- | --- |
| `atlasPacking.test.ts` | 图集紧凑/网格排版、不重叠、尺寸上限、间距、2 的幂 |
| `atlasExport.test.ts` | PNG + JSON 成对导出、名称校验、不覆盖旧输出 |
| `canvasModules.test.ts` | 包配置、关联/停用/卸载、默认包移除后不复活、旧路径迁移 |
| `canvas-contract.test.ts` | 图集操作配置、参数隔离及共享左侧入口所需图标声明 |
| `canvasResources.test.ts` | 文件类型匹配、资源权限和图片工具草稿 |
| `systemExtensions.test.ts` | 启动扫描系统扩展、导航和面板注册 |
| `extensionLayout.test.ts` | 正式包目录与发布资源过滤规则 |
| `hierarchyFilter.test.ts` | 层级名称/路径/通配符搜索 |
| `workspaceAssets.test.ts` | 内部资源副本、导入过滤、保存版本和图片导出 |
| `core.test.ts` | 图片处理器、模型适配和输出文件 |
| `geometry.test.ts` | 裁剪选区移动、缩放与坐标换算 |
| `dock.test.ts` | 停靠/标签布局、层级导出和画布类型匹配 |
| `panelState.test.ts` | 画布连接、文档快照、文件路径和导入 |

## Electron 界面检查

| 文件 | 检查什么 |
| --- | --- |
| `atlas-smoke.cjs` | 图片/图集/新类型的共有 Inspector、左侧快捷入口、参数隔离、应用/取消，以及图集像素和导出 |
| `empty-shell-smoke.cjs` | 无已安装画布包时的菜单、层级和包管理器 |
| `navigation-panels-smoke.cjs` | 包管理操作、设置页和共享导航外观 |
| `navigation-layer-smoke.cjs` | 菜单遮挡、嵌套弹出、互斥、Esc/外部点击 |
| `workspace-smoke.cjs` | 导入、层级文件夹、拖放、导出勾选和窗口数量 |
| `hierarchy-export-smoke.cjs` | 搜索/通配符、折叠状态、导出多选与 ZIP/目录 |
| `canvas-modules-smoke.cjs` | 添加地图示例、切换类型、脚本沙箱和模块卸载 |
| `canvas-resources-smoke.cjs` | 示例资源接入、二进制读取、拒绝与权限撤销 |
| `system-extensions-smoke.cjs` | 示例系统导航、弹窗和停靠面板 |
| `image-editor-smoke.cjs` | 真实图片编辑、Inspector 参数、保存前确认 |
| `save-race-smoke.cjs` | 保存过程中切换输入、多个画布修改同一资源 |
| `inspector-drawers-smoke.cjs` | 扩展自定义 Inspector、错误隔离和超时清理 |
| `canvas-save-sandbox-smoke.cjs` | 脚本沙箱保存回调、字节传输和大小限制 |

## 入口和辅助文件

- `test.cjs` / `run-smoke.cjs`：上面两组检查的统一入口。
- `canvas-save-host.cjs`：保存协议测试，由 `npm test` 自动调用。
- `shipped-records.cjs`：模拟宿主时提供预装图片包，不是独立测试。
- `packaged-smoke.ps1`：真实 EXE 的发布验收。
- `stage-external-package.cjs`：创建隔离的便携版副本并合入 examples；仅用于发布验收，不修改正式 release。

生成的图片、临时包和用户配置都在 `.cache/`，编译测试在 `.test-build/`。这些目录不是示例源码。
