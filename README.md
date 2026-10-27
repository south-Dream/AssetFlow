# AssetFlow

面向游戏开发的桌面资产处理工具，基于 Electron、React 和 TypeScript。

通过「资源层级 + 画布 + Inspector」管理和编辑资产，目前内置图片裁剪、缩放、旋转、透明裁剪和移除背景等能力。

## 使用

1. 导入文件或文件夹，将资产拖入对应类型的画布。
2. 在画布左侧选择工具，在右侧 Inspector 调整参数并应用。
3. 点击「文件 → 保存」或按 `Ctrl+S`，将当前画布结果保存到关联资产。
4. 点击「文件 → 导出」，勾选文件和文件夹，输出 ZIP 或新目录；图片可设置格式、质量和命名模板。

导入的资源使用内部副本，编辑和保存不会修改原文件。层级顶部支持名称、路径搜索和格式筛选。

## 开发与构建

需要 Windows、Node.js 20.15+ 和 npm。

```bash
npm ci
npm run dev
```

```bash
npm test             # 单元测试
npm run test:smoke   # 界面集成检查
npm run package      # 构建 Windows 应用
```

构建后运行 `release/AssetFlow.exe`，分发时保留整个 `release` 目录。依赖、构建产物和模型权重不提交到仓库。

移除背景需要单独安装 Python 依赖和模型，见 [rembg 安装说明](scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/README.md)。

## 目录

```text
scripts/
├─ src/          核心、界面与扩展宿主
├─ extensions/   内置能力、扩展配置和公共 SDK
├─ build/        开发、编译与打包脚本
└─ tests/        自动化测试
test/extensions/ 外部扩展接入示例，不自动加载
docs/            项目文档
```

## 扩展

- **画布扩展**：提供 `config.json`，在主菜单「包管理器」中添加。可声明工具、快捷键、图标、资源入口、Inspector 字段和画布导航；停用、重载或卸载前需关闭对应画布。
- **系统扩展**：放入 `scripts/extensions/system_modules/<id>/`，重启加载。可添加顶部导航、操作命令和面板。
- **业务子模块**：放在对应画布的 `modules/` 中，模型和专用配置由该能力自行管理。

配置用于声明入口，具体功能由模块脚本实现。系统和画布共用导航规则；普通参数可配置显示，特殊字段可使用自定义绘制接口。画布通过资源接口接收文件，通过 `onSave` 返回要保存的内容。

详见 [扩展文档](scripts/extensions/docs/README.md)、[画布规范](scripts/extensions/canvas_moudles/docs/README.md) 和 [示例接入练习](test/README.md)。
