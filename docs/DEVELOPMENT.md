# 开发说明

2026-10-27 新增画布扩展层：`scripts/src/extensions/canvas/` 为 SDK 与配置校验，`scripts/src/extensions/canvas/manager.ts` 管理关联和快照，`scripts/src/extensions/canvas/host.ts` 提供受控 IPC 与隔离文档，`scripts/extensions/canvas_modules/` 保存模块声明、示例和 SDK 入口。新模块开发请优先阅读 [画布模块规范](../extensions/canvas_modules/docs/CANVAS_MODULE_SPEC.md)；以下为原图片处理和模型框架说明，不能将原处理器注册等同于外部画布模块安装。

## 模块边界

- `scripts/src/main/`：Electron 窗口、资源索引、导入、任务状态、IPC 与工作进程生命周期。
- `scripts/src/preload/`：仅暴露类型化业务接口，不暴露 Node 文件系统和任意命令执行。
- `scripts/src/renderer/`：React 工作台和 Schema 参数编辑器。
- `scripts/src/core/framework/`：与媒体引擎无关的处理器、端口、模块、流程及模型契约，注册与运行时校验。
- `scripts/src/core/registry.ts`：可独立加载的图片处理器目录，兼容现有步骤校验入口，不加载 Sharp。
- `scripts/extensions/canvas_modules/image/modules/processing/processors/`：图片参数定义、七类实现与图片模块适配器。
- `scripts/extensions/canvas_modules/image/modules/processing/process.ts`：严格按步骤执行，统一输出编码；预览和导出共用此入口。
- `scripts/src/services/output.ts`：独占写入、重名避让、ZIP 和取消清理。
- `scripts/src/shared.ts`：跨进程的数据接口。

图片通过路径索引；导入仅生成小缩略图，当前图片预览才完整处理。任务用 Worker 隔离 CPU 工作，批量并发为 2；原图和结果各最多保留一个活跃预览 Worker，较新的同类请求终止旧请求。进度按完成的文件数计算，不表示单个算法内部进度。Sharp 每个工作进程限制为一个 libvips 线程，缓存内存 16 MB；该值并非整个图片处理的内存上限。

预览为实际编码后的结果，保留完整输出尺寸。步骤之间使用 PNG 中间数据，以保证顺序和 Alpha 语义；这样实现简单但超大图、多步骤下会重复编解码，后续可在保持结果一致的前提下优化。

## 添加处理器

1. 在 `processors/definitions.ts` 增加图片处理器描述和字段 Schema。
2. 在 `processors/` 添加执行函数，在 `processors/index.ts` 注册实现。
3. 使用 `Context` 中的图片、尺寸、名称和输出参数；返回 Sharp 操作或修改非像素元数据。
4. 增加代表性图片测试。通用参数面板和步骤调度无需修改。

可视化裁剪属于当前特定编辑交互；新增复杂可视化编辑器需要单独提供交互组件。V0.1 没有实现通用插件加载或 DAG 执行。

## 通用模块契约

新媒体模块实现 `AssetModule`，提供 `ProcessorRegistration[]`，通过 `ProcessorRegistry.register()` 注册。每个处理器定义稳定 ID、所属模块、正整数版本、参数 Schema 和输入输出端口。ID 在注册表内唯一；需要区分模块时使用带前缀的 ID，现有图片 ID 为兼容旧预设继续保留。

通用执行形式为 `execute(inputs, params, context) -> outputs`。端口通过 `kind` 约定资产类型，默认接收单个值，`multiple: true` 接收集合（包括空集合）。执行前后检查端口名、类型和数量，参数由 Schema 补默认值并校验。`AssetValue.data` 由模块定义，可以是模块内数据或存储引用；通用层不依赖 Buffer、Sharp、FFmpeg。模块负责验证载荷结构，不同模块使用同一 kind 时必须遵守同一载荷契约。

输入按只读约定使用，处理器显式返回输出；不能修改其他分支持有的输入数据。当前图片适配器为每次调用复制图片 Buffer 和可变警告数组，在适配器内部继续使用原有 Sharp 处理函数，并同步结果尺寸。取消检查、进度与日志通过 `ExecutionContext` 注入；当前界面仍沿用原有批量进度，尚未展示单节点进度。

`WorkflowDefinition` 预留带版本的节点与端口连线格式，本轮未实现图校验、拓扑调度或节点画布。现有步骤列表仍由 `processImage` 串行调用通用注册表，最终统一编码，预览和导出继续共用入口。现有桌面 `Asset` 和 IPC 仍是图片接口，增加其他媒体时需要扩展导入与预览层。

步骤增加可选 `processorVersion`，旧预设缺失时按当前版本读取，校验结果补齐版本；显式不兼容版本直接拒绝。目前没有自动迁移机制。

## 配置驱动的模型

统一推理执行层已增加到 `framework/inference.ts`：按能力与版本匹配模型，校验输入输出端口，串行调度任务，提供取消与进度入口，并在成功、失败、取消后释放会话。第三方实现统一位于 `scripts/extensions/canvas_modules/<画布>/modules/<模块>/<提供方>/`，通用层不导入第三方实现。

首个接入包为 `scripts/extensions/canvas_modules/image/modules/background-removal/rembg/`，由模块入口 `createBackgroundRemoval()` 组合。安装、调用和扩展说明见 [rembg 接入说明](../extensions/canvas_modules/image/modules/background-removal/rembg/README.md)。已通过模块内 `processor.ts` 接入现有图片处理步骤，预览与导出共用该入口。构建复制桥接资源，打包放在 ASAR 外；Python 环境和模型权重仍需安装。

`framework/models.ts` 提供 `ModelDefinition`、`ModelAdapter` 与 `ModelRegistry`。模型配置包含任务、适配器 ID、模型版本、文件路径和校验和、参数 Schema 与默认参数。注册适配器代码和模型配置后，`available(task)` 按任务及适配器兼容性筛选，`resolve(id, task, params)` 返回适配器和经过校验的参数。

`InferenceAdapter` 扩展 `ModelAdapter`，增加适配器 API 版本、加载及会话执行与释放接口。配置不能执行算法代码；不兼容的模型输入输出需要新适配器。rembg 接入包会在执行前检查本地模型校验和，通过独立 Python 进程调用运行时；尚未实现自动下载器。模型配置版本、处理器版本和流程文件版本分别管理。

## 预设格式

```json
{
  "version": 1,
  "steps": [
    {
      "id": "resize-1",
      "processor": "resize",
      "enabled": true,
      "params": {"mode": "max", "max": 1024, "enlarge": false}
    }
  ]
}
```

缺失参数由 Schema 默认值补齐。未知处理器、不合法参数、重复步骤 ID、超过 100 个步骤或超过 1 MB 的预设会被拒绝。配置不包含算法代码。

## 构建

`scripts/build/build.cjs` 用 esbuild 编译主进程、Worker、Preload，输出至 `dist/node/`。Vite 将界面构建至 `dist/ui/`。Preload 仅依赖 Electron，适用于 sandbox。Forge 配置 ASAR，并解包 Sharp 的平台原生资源。

先完成 `npm run typecheck`、`npm test` 和 `npm run build`，再执行 `npm run package` 或 `npm run make`。安装包需在实际 Windows 环境验证原生模块加载、中文路径、拖入文件、导出与退出。首次成功安装后应提交生成的 `package-lock.json`，之后通过 `npm ci` 重现依赖。

用户已完成依赖安装并生成锁文件。类型检查和 10 项测试已通过，已有 `out/AssetFlow-win32-x64/` 应用目录。`npm run package:local` 可复用已安装 Electron 完全在项目目录中打包，绕开 Forge 当前临时目录操作失败的问题；Sharp 原生资源独立解包。桌面启动验收和 Squirrel 安装包仍待完成。
