# 核心的扩展宿主层

这里属于 src 核心，不存放具体扩展业务。

- `canvas/`：Canvas 配置校验、资源协议、Inspector UI 协议、模块管理和 Electron 宿主桥接。
- `system/`：系统扩展配置、启动扫描器、宿主桥接和面板沙箱文档。
- `navigation.ts`：系统与 Canvas 共用的导航追加规则。
- `adapters/`：核心连接可信内置模块的适配器。imageCatalog 只导入元数据；imageBackend 只在处理 Worker 侧加载；modulePaths 解析模块所属运行目录。

对外编写扩展使用工程根目录 `scripts/extensions/sdk/` 或 `scripts/extensions/canvas_moudles/sdk/`，不要直接依赖这里的私有实现。具体图片算法、模型适配、Python 环境和配置放在 `scripts/extensions/canvas_moudles/image/modules/`。
