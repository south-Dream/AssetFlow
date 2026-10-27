# 统一导航：节点树与区域容器

系统顶部与 Canvas 顶部共用 NavNode、区域容器和 MainMenu 绘制器。节点不保存左侧/右侧等摆放信息，容器决定区域和绘制。

## 节点与行为

```ts
type NavNode = {
  id: string;
  name: string;
  children?: NavNode[];
  command?: string;
  action?: { type: "openPanel"; panel: string; host?: "dialog" | "settings" | "dock" };
};
```

children、command、action 三者选一：有 children 就展开菜单；有 command 就执行命令；有 action 就打开面板。任意层级都支持直接动作，不强制先经过下一级菜单。导航整体也是一个 NavNode，容器持有它作为 root。

## 区域容器

```json
{
  "root": {
    "id": "canvas.top",
    "name": "Canvas 导航",
    "children": [
      { "id": "system.edit", "name": "编辑", "children": [] },
      { "id": "map.menu", "name": "地图", "command": "map.open" }
    ]
  },
  "regions": { "left": ["system.edit"], "right": ["map.menu"] },
  "order": ["left", "right"]
}
```

regions 的值是稳定节点 ID，不能用列表下标；只引用 root.children 中的一级节点，不引用深层子项。未知、重复的绑定在加载时拒绝。未显式指定的节点继续按容器默认规则放置，不会遗漏固有按钮。

- SystemNavigationContainer：默认把一级导航放在左侧。
- CanvasNavigationContainer：默认固有导航在左侧、模块专有导航在右侧。
- 导航的递归展开、互斥、按钮样式只在公共 MainMenu 中实现。

Canvas config.json 可提供布局覆盖：

```json
{
  "navigation": {
    "regions": { "left": ["system.edit"], "right": ["map.menu"] },
    "order": ["left", "right"]
  }
}
```

系统扩展也可声明 navigation，但只能绑定自己的一级节点。普通扩展通过配置参与布局；不把任意 React/DOM 注入主页面。

公开接口在 scripts/extensions/sdk/contracts.ts，纯布局构建器在 sdk/navigation.ts。宿主可以继承 NavigationContainerBase/CanvasNavigationContainer 重写 build；Canvas PanelToolbar 的 renderNavigationRegion 回调可重写区域绘制，并通过 draw(entries) 复用默认菜单。这是宿主/可信适配组件的绘制入口；沙箱业务脚本仍遵守公共配置和命令协议。

## 固有菜单边界

系统固有子菜单由本体定义，外部不能追加、覆盖、删除或重命名。外部只能新增独立一级按钮/菜单树，树内部可自由声明多级节点。parent 是注册元数据，不是绘制位置：可省略、写 system.root，或引用本模块自己的菜单；不能写 system.file、system.edit、system.type 等固有节点。

旧 placement:specific 保持为独立一级菜单的兼容写法；placement:edit 与 parent:system.* 子菜单扩展已停止支持，需迁移为独立菜单树。

当前固有入口：顶部包管理器直接打开列表；编辑 → 设置直接打开两栏面板；文件 → 保存/导出图片直接打开输出面板。以后若本体确实需要设置 → 用户设置/系统设置，可将该节点改成 children，不需要修改绘制器。

每份扩展最多 200 个导航节点、6 层声明嵌套、16 个配置区域。聚合扩展时逐项验证累计布局，失败贡献独立报告，不让整个导航渲染失败。
