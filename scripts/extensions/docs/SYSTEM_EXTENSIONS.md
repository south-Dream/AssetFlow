# 系统扩展与通用面板

参考根目录 `examples/extensions/system_modules/preferences/` 中的外部练习包；它不自动加载、不随本体发布。手动合并流程见根目录 `examples/README.md`。复制时同时修改文件夹名、config.id 和所有命名空间 ID，然后重启软件。

## 配置

必需字段：id/name/schemaVersion:1/sdkVersion:1；desc 可选。menus、panels、settingsPages 可省略。命令或 custom 面板需要 entry，指向模块内打包好的浏览器 ESM `.js`。不支持 Node、Electron、主页面 DOM 或任意文件访问；需要的 JS 依赖在模块构建时打包。

panels 声明独立的可复用内容，menus 决定导航入口，settingsPages 决定设置左侧入口。三者不相互强制绑定。同一个面板可以同时有顶层按钮、二级菜单、设置页等入口。

```json
{
  "id": "preferences",
  "name": "偏好",
  "desc": "应用偏好扩展",
  "schemaVersion": 1,
  "sdkVersion": 1,
  "panels": [{
    "id": "preferences.general", "name": "偏好", "renderer": "form",
    "fields": [{ "id": "preferences.author", "name": "作者", "type": "text", "default": "", "order": 10 }]
  }],
  "menus": [{
    "id": "preferences.open", "name": "偏好",
    "action": { "type": "openPanel", "panel": "preferences.general", "host": "dialog" }
  }],
  "settingsPages": [{ "id": "preferences.settings", "name": "偏好", "panel": "preferences.general" }]
}
```

form 复用标准字段：text/number/boolean/select，支持 order、min/max、options 和 input/slider。系统表单不使用 Canvas 的 Drawer 注册表；复杂布局请使用 custom 面板，避免混淆生命周期和实例作用域。

## 脚本与接口

```js
export function activate(context) {
  context.registerCommand("preferences.run", () => context.notify("已执行"));
  context.registerPanel("preferences.custom", {
    mount(panel) {
      const button = document.createElement("button");
      button.textContent = "保存";
      button.onclick = () => panel.setValues({ count: 1 });
      panel.root.append(button);
      panel.onDispose(() => { button.onclick = null; });
    },
    unmount() { /* 清理该视图的资源 */ }
  });
}
```

声明对应 command/custom panel 后才能注册。公共 TypeScript 协议及可选 ExtensionPanelBase 见 `../sdk/index.ts`。无需修改核心解析器。

context 提供 registerCommand、registerPanel、openPanel(panelId, host)、notify。PanelContext 提供 root/panelId/host/values/setValues/onDispose。自定义布局在隔离 iframe 内自由绘制 DOM；宿主负责外壳、停靠、关闭与配置持久化。模块脚本必须自行捕获异步业务错误，错误会被隔离并提示。

业务配置接口为 `await context.getValues(panelId)`、`await context.setValues(panelId, values)` 和 `context.onValues(panelId, callback)`。只能访问本扩展声明的面板；onValues 返回取消订阅函数，视图内订阅应交给 panel.onDispose。示例命令读取偏好中的作者字段，自定义面板示范监听配置变化。

应用命令有独立运行实例；每个自定义面板视图有独立沙箱实例。activate 只注册定义，不要在里面执行一次性业务。视图资源在 mount 中创建，用 onDispose 或 unmount 清理；卸载时异步清理不保证在页面销毁前完成，关键数据应提前 await setValues。

## 状态与生命周期

配置按面板 ID 保存在 userData/system-extension-values.json；form 修改自动保存，custom 显式调用 setValues。不同承载位置读取同一份持久数据，各自保留临时 UI 状态。宿主校验类型、范围、字段数量与大小，写入失败会提示。

系统扩展配置和脚本在进程启动时形成快照；打开面板、打开设置都不会重新读磁盘。新增/更新/移除需要重启整个程序。加载失败会在工作区通知中报告，包管理器仅显示 Canvas 模块；这部分不提供运行时重载按钮。

示例偏好字段仅用于演示配置共享，不会自动改变系统图片预览等行为。实际业务必须由扩展命令或面板脚本实现。
