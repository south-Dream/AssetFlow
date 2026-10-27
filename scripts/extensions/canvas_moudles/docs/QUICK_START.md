# 快速接入

## 创建只有类型的空白画布

创建 `scripts/extensions/canvas_moudles/my-map/config.json`：

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "id": "my-map",
  "name": "我的地图",
  "desc": "空白画布扩展示例",
  "version": "1.0.0"
}
```

运行 `npm run dev`，在主菜单的模块管理器选择该文件。类型立即出现，无需编写脚本。固有导航和设置自动提供，下方没有编辑工具。

## 运行完整示例

1. 在模块管理器添加 `test/extensions/canvas_moudles/map/config.json`。
2. 在已有画布“编辑 → 类型”中选择“地图编辑”。
3. 点击“绘制地块”，Inspector 显示地块尺寸和颜色。
4. 在地图上点击放置地块，点击 Inspector 的“应用”提交，或“取消”丢弃草稿。
5. “编辑 → 设置”直接打开同一个页面，可修改显示、工具入口、快捷键、顺序和网格参数。
6. 此空白地图示例只演示工具、字段和预览，没有声明资源入口，因此不支持保存资产。自己的模块需要按资源接入规范关联单个资产，并通过 `context.onSave` 返回字节；随后 Ctrl+S 将结果保存到该内部资产，文件 → 导出打包。
7. 将另一个画布切换为地图类型，在 Inspector 预览目标中关联它，可收到同类型地图数据。

修改脚本或配置后，关闭所有 map 类型画布，再到模块管理器选择重新加载。移除关联只移除记录，不删除示例目录。

## 使用 TypeScript 和可选基类

```ts
import { CanvasModuleBase, type CanvasScriptContext } from "../../sdk/index";

class MyMap extends CanvasModuleBase {
  activate(context: CanvasScriptContext) {
    context.root.textContent = "我的地图";
    context.registerCommand("my-map.clear", () => context.saveState({ tiles: [] }));
    const listener = () => context.notify("画布尺寸发生变化");
    window.addEventListener("resize", listener);
    this.own(() => window.removeEventListener("resize", listener));
  }
}

export default new MyMap();
```

上例假设作者源码在 `scripts/extensions/canvas_moudles/my-map/src/index.ts`，SDK 相对路径为 `../../sdk/index`。清单需声明工具或菜单所引用的 `my-map.clear` 命令。

在工程中使用已有 esbuild 编译，生成入口：

```powershell
node node_modules/esbuild/bin/esbuild scripts/extensions/canvas_moudles/my-map/src/index.ts --bundle --format=esm --platform=browser --outfile=scripts/extensions/canvas_moudles/my-map/index.js
```

清单添加 `"entry": "./index.js"`。请将所有运行依赖打入入口，不要把 .ts 文件直接交给加载器。
