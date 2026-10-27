# 画布模块与脚本扩展规范 v1

## 1. 系统模板与模块边界

资源拖入/打开接口已实现，见 [资源接入规范](./RESOURCE_INPUT.md)。系统只做规则匹配与受控读取，内容区域由业务 handler 创建。旧文中的“没有任意磁盘访问”仍成立，不代表不能通过 SDK 读取已授权资源。

系统提供资源层级、画布面板和 Inspector 容器。所有画布共享固有模板：左侧统一“编辑”导航（首项为“类型”子菜单）、右侧类型专属导航、输入与预览目标、设置入口、停靠布局和窗口生命周期。

系统画布类型注册表的对外展示数据只有 `{ id, name, desc }`。模块关联记录另外保存配置路径、版本、启用状态、修订号和错误。扩展脚本不能写这两份记录，也不能读取或修改宿主的内部模板对象。

外部模块必须经过“顶部包管理器”建立关联。复制目录本身不会生效。管理器读取 config.json，校验成功后生成注册项；下次启动只恢复已关联的模块。没有 entry 的有效模块仍能成为空白画布类型，自动获得系统导航、设置和 Inspector 固定区。

系统内置 image 是可信的预装模块，声明位于 `scripts/extensions/canvas_moudles/image/config.json`，Sharp、Python 业务实现均放在该画布的 `modules/` 内，通过 `scripts/src/extensions/adapters/` 接入通用核心。audio / atlas / video / flow 暂时保留旧版占位类型，它们不表示已实现对应编辑器。

## 2. 目录约定

```text
scripts/extensions/canvas_moudles/
  <id>/
    config.json                 # 唯一模块清单
    index.js                    # 可选，浏览器 ESM 编译产物
    scripts/src/                        # 可选，作者自己的源码
    capabilities/
      <能力名>/
        config.json             # 可选，子能力自己的配置
        adapters/               # 作者组织的适配代码
        models/                 # 作者管理的模型资源
```

模块可放在工程之外，管理器记录所选 config.json 的绝对路径；本版是“关联安装”，不复制文件、不解压 ZIP、不下载包。模块目录名必须等于 id。删除、移动源目录后，下次加载会报错；“移除关联”不会删除模块文件或用户数据。

id 仅允许小写字母开头，随后为小写字母、数字、下划线或连字符，最长 64 字符。image、audio、atlas、video、flow 为系统保留 ID。扩展项和命令必须以 `<id>.` 开头，例如 `map.paint`。禁止 `system.*`、重复扩展 ID、绝对入口路径、父目录路径以及通过符号链接或 junction 越出模块目录。

## 3. config.json

最小清单：

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "id": "map",
  "name": "地图编辑",
  "desc": "自定义地图工具",
  "version": "1.0.0"
}
```

`tools`、`menus`、`settings`、`capabilities` 省略时按空数组处理。只有工具或菜单而没有 entry 会被拒绝。

| 字段 | 规则 |
| --- | --- |
| schemaVersion | 当前固定为 1，配置结构版本 |
| sdkVersion | 当前固定为 1，运行协议版本 |
| id / name / desc | 用于系统注册表；id 在安装后不可通过重载修改 |
| version | 模块自身版本字符串，独立于 SDK 版本 |
| entry | 模块内相对 .js 路径，例如 ./index.js |
| tools | 命令或交互工具声明 |
| menus | 固定编辑菜单之后的追加项、右侧专属菜单 |
| settings | 统一设置面板中当前类型的参数 |
| capabilities | 子能力 ID 和相对 JSON 配置路径 |

清单最大 1 MB，脚本最大 2 MB，单个子能力 JSON 最大 1 MB，每个配置列表最多 100 项，菜单最大深度受限。子能力 JSON 的业务结构由模块解释，系统不猜测模型格式。

## 4. 菜单扩展

```json
{
  "menus": [
    {
      "id": "map.menu",
      "name": "地图",
      "placement": "specific",
      "children": [
        { "id": "map.clearItem", "name": "清空地图", "command": "map.clear" }
      ]
    },
    {
      "id": "map.editExtra",
      "name": "重建预览",
      "placement": "specific",
      "command": "map.rebuild"
    }
  ]
}
```

placement:specific 为独立一级导航的兼容写法，默认出现在右侧；不能使用 edit 或向固有子菜单追加。节点通过 command/action/children 区分直接动作与展开，区域由 navigation.regions 容器配置管理。菜单 command 必须由脚本注册。

固有“编辑”始终包含：

1. 类型 → 选择画布类型。
2. 显示编辑工具栏 → 直接切换显示。
3. 设置 → 直接打开当前类型的统一设置页，同页包含显示、快捷入口和工具参数。

这些项目不能删除、覆盖或追加子项。配置中的工具会自动出现在“编辑 → 工具”中，隐藏快捷按钮不会移除工具本身。模块可以新增独立一级菜单，不能向固有系统菜单注入脚本或节点。

## 5. 工具、命令和快捷键

```json
{
  "tools": [
    {
      "id": "map.paint",
      "name": "绘制地块",
      "command": "map.paint",
      "kind": "tool",
      "shortcut": "B",
      "toolbar": true,
      "fields": [
        { "id": "map.size", "name": "尺寸", "type": "number", "default": 32, "min": 8, "max": 128 }
      ]
    },
    { "id": "map.clear", "name": "清空", "command": "map.clear", "kind": "command", "toolbar": false }
  ]
}
```

kind=command 表示一次执行，不打开工具参数编辑区。kind=tool 表示交互工具，选择后激活脚本命令，并在 Inspector 下方打开配置字段；支持 preview、apply、cancel。缺省为 tool。toolbar 缺省为 true；用户可以在统一设置里控制可见性、上下移动和修改快捷键。工具栏、菜单和快捷键引用同一个 command。

快捷键格式为单个字母或数字，可加 Ctrl、Alt、Shift 前缀，例如 B、Ctrl+B、Ctrl+Shift+B。Ctrl+S 由系统保存功能保留。只在当前编辑画布执行，输入框、下拉框、文本编辑和模态设置中不触发工具快捷键；同一类型有多个匹配项时不执行。iframe 内的按键通过 SDK 协议转交宿主。

## 6. Inspector 和字段

固定区由系统提供输入源和预览目标，同类型画布可关联，禁止自身或循环关联。默认目标为本画布。图片流水线会将草稿传给下游预览，并保持保存的步骤不变。

扩展的可编辑区由 tools[].fields 生成，支持 text / number / boolean / select。每个字段必须声明 id、name、type、default；number 可提供 min/max；select 必须提供 options 且 default 必须是其中一项。字段 ID 在同一清单内唯一，也属于模块命名空间。

选择交互工具后收到一次初始 preview，参数变化继续收到 preview。应用和取消由宿主发送对应事件，模块负责把草稿提交或恢复。不要在 preview 中覆盖已提交文档；仅在 apply 或明确的一次性命令中调用 saveState。切换到其他画布会取消当前 Inspector 的工具草稿，复杂跨画布编辑需由模块明确处理。

本版 Inspector 和设置支持配置字段；画布区域可以自定义 DOM。任意 React Inspector 组件、自定义设置页、动态运行时新增字段尚未开放，不能通过 JSON 填代码绕过。

## 7. 统一设置和保存

左侧为工作区、画布类型和扩展页面的平面列表；选择画布后，右侧同页展示“显示 / 编辑快捷入口 / 工具设置”三个内容分组。settings 字段与工具字段使用相同格式。

从面板打开的工具显示、顺序、快捷键和 settings 按“面板 ID + 类型”独立保存在宿主 localStorage，不修改原始 config.json。主菜单中的类型配置作为新面板默认值，已有面板不跟随其他面板修改。当前没有项目级设置覆盖。更改模块设置会重建其沙箱，丢弃未应用草稿，并读取最近一次 saveState 保存的文档状态。

模块通过 `saveState` 提交最多 1 MB 的 JSON 会话状态，宿主缓存并标记画布未保存。它不是资产文件序列化协议。画布关联单个资产后，Ctrl+S / 文件 → 保存通过 `onSave` 获取当前内容字节，更新同一内部资产，磁盘源文件保持不变。未关联资产时不能保存；未实现 `onSave` 时明确报告失败。具体契约见本文“保存当前画布内容”。

文件 → 导出统一选择资产/目录，并使用每个资产最近保存的内容打包。所选资产存在未保存的画布修改时，先确认保存；同一资产有多个画布版本时选择保存哪个画布，其余草稿保留。当前菜单不再提供独立画布 JSON 文档或面板配置的打开/保存入口。

## 8. 脚本入口与 SDK

入口必须是可独立加载的浏览器原生 ESM，默认导出模块对象：

```js
export default {
  async activate(context) {
    context.root.textContent = "地图画布";
    context.registerCommand("map.clear", () => {
      context.root.textContent = "已清空";
      context.saveState({ tiles: [] });
    });
  },
  async deactivate() {
    // 释放作者创建的订阅和资源。
  }
};
```

不要在模块顶层修改宿主状态。activate 完成前注册清单声明的全部命令；缺失、重复或未声明的命令都会报错。初始化超过 10 秒提示超时。浏览器事件回调中的异常和 Promise 拒绝会显示为画布错误。

| context 成员 | 用途 |
| --- | --- |
| root | 当前沙箱内的画布挂载 HTMLElement |
| windowId | 当前画布实例 ID |
| settings | 经过校验并补默认值的类型设置 |
| state | 最近保存/打开的文档状态，首次为 null |
| capabilities | 以能力 ID 为键的子能力 JSON 快照 |
| previewTarget | 初始预览目标，self 或 linked |
| registerCommand(id, handler) | 注册清单中声明的命令；handler 接收参数对象 |
| onToolEvent(handler) | 接收 { phase, tool, params } |
| onInput(handler) | 接收上游画布发布的 JSON 数据；无输入为 null |
| onPreviewTarget(handler) | 预览目标改变时接收 self 或 linked，模块据此切换本地原始内容与结果展示 |
| publishOutput(value) | 发布最多 1 MB 的可序列化数据给同类型下游 |
| saveState(value) | 提交最多 1 MB 的可序列化文档状态 |
| notify(message) | 在宿主通知区展示文字 |

模块自己定义同类型输入输出的数据协议；系统不自动把 JSON 变成地图或音频。publishOutput 负责传数据，本画布如何展示原始内容、草稿和结果由模块绘制逻辑负责。跨类型连接目前不支持。

TypeScript 作者可以从 `scripts/extensions/canvas_moudles/sdk/index.ts` 导入类型及可选 CanvasModuleBase。基类只提供 own(cleanup) 和逆序清理，必须自己实现 activate。接口是契约，继承不是强制要求。运行时依赖应打成一个浏览器 ESM 文件；不要在最终入口使用宿主源码路径、Node require、裸 npm 包导入或相对拆包 import。当前加载器通过 Blob 执行入口，不提供额外 JS chunk 或资源 URL 服务。

## 9. 加载、重载和隔离

每个外部画布运行在独立的 sandbox=allow-scripts iframe 中，不授予 allow-same-origin。宿主通过专用 assetflow-canvas 协议提供会话文档；沙箱 CSP 禁止网络、子 frame 和表单提交。脚本拿不到宿主 DOM、Node、Electron、Preload 或系统配置。

脚本可以操作自己的 DOM、浏览器 Canvas 和内嵌资源；不能直接读磁盘、运行 Python、加载本地 ONNX 或请求网络。SDK 消息按来源窗口和声明命令校验。接口/基类本身不是安全隔离，iframe 和受控 IPC 才是当前执行边界。这不是对恶意脚本 CPU/内存耗尽的完整资源隔离保证。

模块管理器提供添加、启用、停用、重新加载和移除关联。新增类型无需重启。修改磁盘文件不会自动生效，必须在管理器重新加载；脚本与子能力 JSON 保持上一次成功读取的快照。正在使用的类型必须先关闭全部关联画布，才能停用、重载或移除。没有运行中代码和草稿的无缝替换。

读取、路径检查、JSON 校验和持久化失败会回滚关联记录，并保留旧快照。JS 的实际激活由新沙箱执行；语法错误、未导出 activate、命令缺失或算法异常显示为画布运行错误，不承诺脚本运行失败时自动回滚版本。关闭时尽力调用 deactivate，随后销毁整个 iframe；不依赖异步析构完成保证保存，重要状态应提前 saveState。

## 10. 子能力、模型和后端

顶层示例：

```json
{
  "capabilities": [
    { "id": "map.generator", "config": "./capabilities/generator/config.json" }
  ]
}
```

管理器只校验路径、大小并读取 JSON，然后在 context.capabilities["map.generator"] 提供。模型名称、版本、校验和、参数、适配器选择由子能力配置定义，不能把某种模型格式硬编码到系统画布模板。

内置图片 rembg 的模型配置现统一位于 `scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/config.json`；可信后端读取它，Python 环境、模型文件和 runner 一并位于 `scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/`，避免复制庞大虚拟环境。发布时保持相同的画布/modules层级，不再生成独立的resources/modules副本。

外部脚本读取模型配置不等于获得本地推理权限。本版未开放第三方任意本地进程或原生后端安装；这需要后续独立的可信能力服务、权限和任务接口。可以先实现纯浏览器能力，不能用配置声明自动执行模型或 Python。

### 保存当前画布内容

模块使用 `context.onSave(handler)` 注册当前内容的序列化回调。回调可同步返回，也可返回 Promise；结果必须为 `{ data: ArrayBuffer, name?: string }`。

```ts
context.onSave(async () => ({
  data: new TextEncoder().encode(JSON.stringify(documentModel)).buffer,
  name: "map.json",
}));
```

`data` 最大为 128 MB；可选 `name` 为不含 Windows 禁用符号（`\ / : * ? " < > |`）或控制字符的文件名，不能以点或空格结尾，最长 255 字符。回调负责返回当前可保存内容，不能以 `saveState()` 或 `publishOutput()` 替代；这两个 API 分别用于会话状态和预览输出。未注册保存回调、序列化失败、无效数据、超过大小限制均会向宿主报告失败。宿主在 30 秒后取消等待，关闭或重载画布也会拒绝并清理挂起请求。

保存消息仅接受当前 iframe 与父宿主之间的 `assetflow.canvas.v1` 通道，使用请求 ID 匹配响应。模块只返回字节和建议名称；当前关联资源的选择、覆盖确认与写入路径由应用宿主处理，模块不接触磁盘路径。
