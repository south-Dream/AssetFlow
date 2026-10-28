# 扩展入口

正式扩展位于 `scripts/extensions/`；教学示例在根目录 `examples/extensions/`，不自动加载、不随本体发布。手动合并接入及 pkgmgr 移除步骤见根目录 `examples/README.md`。

目录统一为 `scripts/extensions/`：

- `builtin/`：随程序编译的固有导航定义，运行时受保护；编辑发布目录内的副本不会覆盖固有菜单。
- `system_modules/<id>/config.json`：启动时发现的应用级扩展。固定位置，不需要管理器安装；新增、修改、删除后必须重启。目录不存在时跳过，坏扩展独立报告。
- `canvas_modules/<id>/config.json`：原有 Canvas 扩展，仍通过主菜单管理器关联，关闭该类型画布后可重载。旧关联路径失效时，自动尝试相同位置的 `scripts/extensions/canvas_modules`。
- `sdk/`：公共导航与系统面板协议；Canvas SDK 保留在 `canvas_modules/sdk/`。

开发模式扫描工程目录；便携版扫描 `AssetFlow.exe` 旁的 `scripts/extensions/system_modules`。安装版资源备用位置为 `resources/scripts/extensions/system_modules`。源码构建/打包不从外网下载或自动安装扩展。

详见 [目录边界](DIRECTORY_LAYOUT.md)、[统一导航](NAVIGATION.md)、[系统扩展与面板](SYSTEM_EXTENSIONS.md) 和 [Canvas 扩展规则](../canvas_modules/docs/README.md)。
