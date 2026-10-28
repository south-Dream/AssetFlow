# Canvas 模块扩展文档

当前接入规范以 [Canvas 与 Node 类契约](./CLASS_CONTRACT.md) 为准：必选抽象接口、配置映射、固定宿主布局和启动校验均已实现。旧版 `activate(context)` 示例仅用于迁移参考。

本目录名称按工程约定使用 `canvas_modules`，请勿混用 `canvas_modules`。

- [模块、脚本与扩展规范](./CANVAS_MODULE_SPEC.md)：配置格式、菜单、工具、Inspector、设置、生命周期和保存。
- [快速接入](./QUICK_START.md)：从空白类型到可运行地图示例。
- [资源接入接口](./RESOURCE_INPUT.md)：资源规则、canAccept/open/dispose、受控读取和音视频示例。
- [工具栏与图标](./TOOLBAR_ICONS.md)：左侧工具栏、模块内图标路径、名称描述提示与菜单规则。
- [图片编辑与输出](./IMAGE_EDITING.md)：Inspector 上下分区、工具草稿和保存导出选项。
- [Inspector 扩展接口](./INSPECTOR_EXTENSION_DESIGN.md)：常驻字段、操作字段、order、模块适配器与自定义 Drawer。
- [本次实施与验证](./VALIDATION.md)：已实现范围、验证证据和当前边界。

SDK 类型和可选基类入口：`scripts/extensions/canvas_modules/sdk/index.ts`。

运行示例：顶部包管理器 → 底部 ＋，选择 `examples/extensions/canvas_modules/map/config.json`。安装后，在已有画布的“类型”中选择“地图编辑”，或通过主菜单“编辑 → 新建画布”创建。默认编辑画布上限为 2，新建前可先调整工作区设置。

导航现与系统顶部使用同一协议，新增 parent/order/action，固有子菜单已固定，specific 保持兼容，edit 需迁移到独立一级导航。见 [统一导航](../../docs/NAVIGATION.md)。系统扩展启动扫描，Canvas 仍通过管理器关联。
