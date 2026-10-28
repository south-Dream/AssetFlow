# Canvas 类契约 v3

宿主固定画布骨架、单行导航、Inspector 上下区和事件接线。CanvasMgr 管理窗口、选中 ID、保存和历史；HierarchyMgr 管理资产；InspectorMgr 只保存显示状态。切换画布显示其基础属性，选中工具后才显示下区参数。Inspector 不管理画布或工具生命周期。

## 两种 Node

- `NavNode`：`name`、树形 `children`、`trigger()`；用于即时动作、打开面板和菜单。
- `ToolNode extends NavNode`：增加 `draw(context)`。基类安装不可替换的 `trigger()`，统一选择工具并通知 Inspector；可用 `onTrigger()` 执行业务初始化。

没有 PropertyNode、ResourceNode、FieldNode 或独立 CommandNode。字段不是 Node，也不能注册新的字段渲染类型。普通字段在自己的 `draw()` 中调用 `context.fields(schema)`；特殊排列或控件通过 `context.ui.row/column/input/slider/button/text` 返回受控 UI 树。可自行提取模块内共享绘制函数。

## Canvas 必选接口

继承 `CanvasBase`，完整实现以下方法；无业务时允许空实现：

| 方法 | 职责 |
| --- | --- |
| draw | 在 context.root 内绘制画布内容 |
| drawProperties | 返回 Inspector 上区的模块基础属性 |
| input / properties / target | 接收关联输入、基础属性变化和预览目标 |
| open | 接收配置允许的文件，校验业务内容后更新画布 |
| capture / restore | 可克隆的文档快照及恢复；不要保存 DOM、文件句柄或解码对象 |
| clear | 清空文档内容 |
| save | 序列化为 ArrayBuffer，可返回文件名；无可保存输出应明确报错 |
| dispose | 释放画布自身的视图、订阅与解码缓存；不删除层级资产 |

当前参数预览、应用和取消可通过 `edit(tool, phase, values)` 适配业务。历史由装配层统一记录，撤销恢复内容和此前的工具参数、Inspector 选中状态。

## 映射与边界

```json
{
  "bindings": {
    "canvas": "MyCanvas",
    "nodes": { "sample.resize": "Resize" }
  }
}
```

`tools` 声明 Node 元数据；`kind: "command"` 对应普通 NavNode，其余对应 ToolNode。菜单的 command 必须引用本模块声明的 Node。`bindings.nodes` 必须与声明逐项对应。入口导出 `defineCanvasModule({ MyCanvas, Resize })`；浏览器脚本也可使用 `globalThis.assetFlowCanvasSDK` 的基类，导出 `{ contractVersion: 3, classes: { MyCanvas, Resize } }`。

宿主逐窗口创建实例，校验方法、映射、命名空间和工具固定 trigger，再封闭注册。Canvas 上下文只提供获授权资源的 read/url，不提供命令、绘制器或资源入口注册方法。第三方不能替换容器、系统节点或其他模块实现。

基础属性字段声明在 `inspector.canvas`，工具参数声明在自己的 `fields`，用于默认值和边界校验；实际显示由各自 draw 决定，不接受字段 renderer 扩展。示例见 `examples/extensions/canvas_modules/map`。

## 宿主公共行为

系统导航与画布导航均为单行，系统项始终靠前，扩展只能在后方排序，不支持左右区域。普通命令和工具都能通过导航触发；左侧快捷栏只展示 ToolNode。

每个画布的编辑菜单由宿主提供保存、撤销、清空和类型，设置固定最后。设置跳转当前类型的统一设置页，配置快捷键及左侧快捷工具。Ctrl+S 保存当前画布，Ctrl+Z 撤销当前画布；系统文件菜单的“全部保存”调用 CanvasMgr 遍历可编辑画布。

Atlas 通过公共 createCanvasSession 装配。图片编辑保留已有 VisualEditor 和处理流水线，通过同一 ToolNode、公共菜单及画布管理器适配；第三方不能替换可信原生服务注册表。
