# 外部扩展接入练习

这里的扩展是教学用外部包，不是软件内置功能，不会自动注册、不会自动复制进 release。

## 第一次接入

1. 关闭 AssetFlow。
2. 将本目录里的整个 `extensions` 文件夹复制到软件根目录的 `scripts` 文件夹中，选择合并目录。开发工程与便携版均使用同样层级：`scripts/extensions/`。请复制，保留原始测试包以便重新练习。
3. 启动软件。系统扩展示例位于 `scripts/extensions/system_modules/preferences/config.json`；启动扫描后才会出现“偏好”“扩展示例”入口。
4. 打开主菜单“包管理器 → 底部 ＋”，选择合并后的 `scripts/extensions/canvas_moudles/map/config.json`。
5. 在“编辑 → 新建画布”中选择“地图编辑”，或在已有画布“编辑 → 类型”中切换。只有注册之后才会出现该 Canvas 类型。

本目录还提供 audio-player 与 video-player，可用相同方法注册并拖入相应资源。它们都不影响默认图片画布。

## 练习移除

- 关闭对应类型的所有画布后，在管理器中选择“移除关联”：删除注册信息，保留文件，可重新添加同一个 config.json。
- 选择“卸载并移至回收站”：确认完整路径后，整个模块目录（config.json、脚本与资源）移至系统回收站，注册信息也移除。要重试，可从这里重新复制测试包。
- 系统扩展按启动扫描管理。删除正式目录中的 `system_modules/preferences` 文件夹并重启，即可移除这组示例导航。

测试源码中的自动检查会显式引用本目录，这是测试行为；正式应用不会扫描 `test/`。

本版 pkgmgr 以“文件夹 + config.json”作为包入口，不要求打成 ZIP，也不会安装 npm 包或自动下载依赖。
