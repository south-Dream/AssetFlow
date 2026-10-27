# Inspector 扩展接口 v1

状态：已实现。本文描述当前可用 API；旧版“上方不能追加字段 / 不支持自定义 Drawer”的限制已被本次更新取代。

## 两个容器

- 上方：保留系统输入源、预览目标，其后追加 `inspector.canvas`。跟随画布实例常驻，不需要选择操作。
- 下方：按工具稳定 ID 选择 `inspector.operations` 字段，跟随当前操作草稿，参与预览、应用、取消。
- 两区共用字段控件和 Drawer 接口，分别滚动、共享可拖动分隔条。模块只能追加自己的内容，不能替换系统固有项。

## config.json

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "id": "map",
  "name": "地图编辑",
  "desc": "示例",
  "version": "1.0.0",
  "entry": "./index.js",
  "tools": [
    { "id": "map.paint", "name": "绘制", "command": "map.paint" }
  ],
  "inspector": {
    "canvas": [
      { "id": "map.gridSize", "name": "网格尺寸", "type": "number", "default": 32, "min": 8, "max": 128, "control": "slider", "order": 10 },
      { "id": "map.clear", "name": "清空", "type": "boolean", "default": false, "control": "button", "command": "map.clearCommand", "order": 20 }
    ],
    "operations": {
      "map.paint": [
        { "id": "map.brushSize", "name": "画笔大小", "type": "number", "default": 16, "min": 1, "max": 128, "renderer": "map.sizeDrawer", "order": 10 }
      ]
    }
  }
}
```

字段 `type` 是值类型，支持 text、number、boolean、select；`control` 选择标准 input、slider、button；`renderer` 引用特殊字段的绘制器。不要用自定义 type 名向核心注入解析逻辑。

所有字段必须有稳定的模块命名空间 ID、名称和默认值。order 越小越靠前，相同 order 保留声明顺序。slider 必须为 number 并提供 min/max；button 必须声明 command，脚本用 registerCommand 实现。renderer 必须属于本模块命名空间。

现有 tools[].fields 继续有效。inspector.operations 是按操作 ID 注入字段的另一种声明方式，加载时归一化到同一字段描述；同一工具不能在两处重复声明。模块配置加载、重载和兼容校验仍由模块管理器统一完成。

## 常驻值绑定

```js
export default {
  activate(context) {
    let model = { ...context.canvasProperties };
    context.onCanvasProperties(values => {
      model = { ...values };
      // 更新自己的业务对象，再刷新自己的画布。
    });
    context.registerCommand("map.clearCommand", () => {
      // 执行业务命令。
    });
    context.registerCommand("map.paint", () => {});
  }
};
```

canvasProperties 是启动时的只读快照，后续变更通过 onCanvasProperties 获取，不会为每次属性变更重启模块。值按画布实例保存；它们参与当前画布的保存状态判断；当前菜单不再单独导出扩展画布文档或图片面板配置。它们不属于模块全局设置，也不和其他同类型面板共享。

下方操作值继续通过 onToolEvent 的 params 获取；preview 是草稿预览，apply 才提交，cancel 丢弃。不把这些值和常驻属性混到同一个对象中。

## 自定义 Drawer

```js
context.registerDrawer("map.sizeDrawer", {
  draw(ctx) {
    return ctx.ui.column([
      ctx.ui.slider({
        value: Number(ctx.value), min: 1, max: 128, step: 1,
        onChange: value => ctx.setValue(value)
      }),
      ctx.ui.row([
        ctx.ui.input({ value: Number(ctx.value), onChange: ctx.setValue }),
        ctx.ui.button({ label: "重置", onClick: () => ctx.setValue(16) })
      ])
    ]);
  },
  dispose() {
    // 整个模块卸载时释放绘制器自有资源。
  }
});
```

FieldDrawContext 提供 field、当前 value、当前容器 values、setValue、ui 和 onDispose。可组合 text、input、slider、button、row、column。使用 ctx.onDispose(cleanup) 登记本次绘制会话的监听器清理；参数变更、字段取消、绘制失败、超时、模块关闭均会释放会话。不要把持久业务修改放在 draw 函数本身。

同一个 Drawer 可绑定多个字段，甚至分别用于上下两个区域。上下文和事件按请求 ID 隔离，ctx.setValue 只写当前字段，宿主再做类型和范围校验。配置里声明 renderer 后，模块必须用 registerDrawer 实现；缺失实现会在该字段提示，不会让整个画布失效。

本版自定义 Drawer 用于画布/操作属性；模块 settings 页仍只支持标准字段，不接受 renderer、命令按钮等运行时能力，错误配置会明确拒绝。

## 模块自有适配器与类似特性的元数据

SDK 提供 InspectorAdapter<Model> 类型和 bindInspectorModel(model, adapter) 助手。适配器完全在模块内运行：

```ts
const adapter = {
  describe: () => [
    { id: "map.gridSize", name: "网格尺寸", type: "number" as const, default: 32, order: 10 }
  ],
  read: (model: { gridSize: number }) => model.gridSize,
  write: (model: { gridSize: number }, _fieldId: string, value: string | number | boolean) => {
    model.gridSize = Number(value);
  }
};
const binding = bindInspectorModel(model, adapter);
// 在模块构建脚本中：config.inspector.canvas = binding.fields；写入 config.json。
// 在运行时：context.onCanvasProperties(values => binding.write(values));
```

describe 可以读取模块自己的注解、类静态元数据、第三方模型定义等，生成标准字段描述；read/write 负责业务绑定。可以先用显式元数据表获得“给参数标记就能生成面板”的效果，不强制启用 TypeScript 装饰器。

当前元数据通过模块构建脚本生成 config.json；不是运行时随意向核心追加语法。复杂对象可由模块适配器拆为多个基础字段，或以文本形式序列化并交给特殊 Drawer 解释。本版宿主字段值为 string/number/boolean，不传输任意函数或业务对象。

## 隔离与绘制边界

第三方代码仍在 iframe 沙箱内。Drawer 返回的是 SDK 生成的受限控件树；回调函数保留在沙箱，控件交互通过事件 ID 回传，不把函数、DOM 或 React 节点注入宿主。

宿主验证控件种类、结构、值、深度、数量和描述大小；不支持任意 HTML 注入。最多 200 个节点、8 层深度，绘制请求 10 秒超时。无效返回、异常和超时只影响字段并清理订阅。此版本不是任意 DOM / 原生 Canvas 字段插件；完全自由绘图需要后续受限绘图协议或专属隔离视图。

扩展点是“模块适配器 + Drawer 注册表”，没有 registerParser 或修改核心解析器的入口。基础解析器负责统一协议，特殊业务只写在对应模块和 Drawer 中。

## 示例

加载 test/extensions/canvas_moudles/map/config.json 后，不选工具时上方显示网格尺寸、背景和清空按钮；选中绘制地块后，下方显示画笔尺寸和颜色。网格尺寸与画笔尺寸复用 map.sizeDrawer，包含滑条、数值输入和重置按钮。

## 工具切换与未应用修改

宿主按工具默认参数记录初始值；修改后切换工具，会询问应用、放弃或取消。没有修改时直接切换，并同步工具栏和 Inspector。应用/取消回调可以返回 Promise；宿主等待完成后再激活下一个工具，失败时保留当前操作。

仅改变工具参数时宿主自动判断；画布内绘制等不改变参数的业务编辑，应调用 `context.markToolDirty()`，恢复到原状态时可调用 `context.markToolDirty(false)`。该标记只针对当前画布的当前工具，不代表保存整个工程。工具按钮、菜单及快捷键共用宿主切换流程，模块不要自行模拟选中状态。
