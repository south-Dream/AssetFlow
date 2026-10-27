# 画布资源接入规范 v1

画布外壳不解码资源，也不根据扩展名硬编码编辑器。模块声明接收规则并注册实现；无规则、无实现或模块尚未就绪时，不接受资源拖入。

## 配置

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "id": "my-viewer",
  "name": "我的预览器",
  "desc": "资源接口示例",
  "version": "1.0.0",
  "entry": "./index.js",
  "resources": [
    {
      "extensions": ["png", "jpg", "jpeg"],
      "mimeTypes": ["image/png", "image/jpeg"],
      "handler": "my-viewer.open",
      "mode": "replace",
      "maxCount": 1
    }
  ]
}
```

- extensions 和 mimeTypes 至少声明一项。扩展名不带点、不区分大小写，MIME 支持 image/* 这样的类别通配符。
- 两类规则按“或”匹配，每一批资源必须全部符合一个规则。多个规则按配置顺序选择第一个匹配项。
- maxCount 缺省为 1，允许 1–100。超限或混入不匹配资源，拒绝整批，不静默只加载第一项。
- mode 缺省为 replace，也可为 append。replace 在业务接受后释放旧资源；append 保留当前 handler 的文档和已接收资源。切换 handler 仍释放旧文档。
- handler 必须属于当前模块命名空间，且必须在 activate 完成前注册。外部模块声明 resources 时必须提供 entry。
- MIME 由系统元数据推断，只用于初筛。实际内容、解码器和业务约束必须由 canAccept 校验。

## 脚本实现

```js
export default {
  activate(context) {
    let image;
    context.resources.registerHandler("my-viewer.open", {
      async canAccept(resources) {
        return {
          accepted: resources.length === 1 && resources[0].size <= 128 * 1024 * 1024,
          reason: "需要单个、不超过 128 MB 的图片"
        };
      },
      async open(resources, options) {
        const url = await context.resources.url(resources[0].id);
        image = document.createElement("img");
        image.src = url;
        image.style.cssText = "max-width:100%;max-height:90vh";
        context.root.replaceChildren(image);
      },
      async dispose() {
        image?.remove();
        image = undefined;
      }
    });
  }
};
```

canAccept 支持同步/异步，返回 boolean 或 `{ accepted: boolean, reason?: string }`。拒绝时不会 dispose，也不会修改原绑定。不要在 canAccept 中改动当前文档；可读取资源验证文件内容。open 负责创建模块自己的图片、音轨、播放器、时间轴或其他编辑区域。open 自身的异常会提示失败，但如果 dispose 已执行，不承诺自动恢复被释放的旧文档；需要回滚的模块应在 canAccept 先完成解码或自行实现业务事务。

## SDK 资源接口

| 接口 | 用途 |
| --- | --- |
| context.resources.registerHandler(id, handler) | 注册清单声明的入口，禁止重复和未声明 ID |
| context.resources.read(id) | 读取已授权资源为 ArrayBuffer |
| context.resources.url(id) | 为已授权资源创建宿主管理生命周期的 Blob URL |

传给 handler 的资源引用只有 `id / name / extension / mimeType / size / width / height`，没有任意磁盘路径。读取资格只授予当前用户打开的资源，以及正在 canAccept 校验的候选资源；拒绝后撤销候选资格，replace 后撤销旧资格。模块关闭时释放资源 URL。系统验证会话归属和资源权限，不提供传入路径就能任意读取文件的接口。

当前每个读取文件限制 128 MB，采用内存读取，没有大文件流式播放。音视频能否解码取决于 Electron/Chromium 的实际编码支持。资源 ID 是当前导入会话的引用；现有扩展画布文档保存模块 JSON 状态，不自动重建外部文件引用，重新启动后需要再次打开资源。

## 所有入口共用

以下入口均经过同一资源规则和 handler：

1. 拖入系统文件或层级资源。
2. 双击层级中的资源，打开到当前激活的编辑画布。
3. 文件 → 打开资源到当前画布。
4. Inspector 输入源选择资源。

文件菜单的打开命令直接位于二级；打开行为不保存原文件。框架不会自动猜测并切换类型。想在音频画布打开 MP3，需要先选择支持该资源的模块类型。

宿主将“授权 → canAccept → dispose/open → 确认绑定”串行执行，避免连续拖入或双击导致后一资源的读取资格被前一次结果覆盖。多资源及 append 的重复处理由模块决定，不受图片单文件去重逻辑约束。

## 自带实现

- image：系统预装，接收 PNG / JPEG / WebP，图片业务适配器位于 `scripts/extensions/canvas_moudles/image/resourceHandler.ts`。
- audio-player：在管理器加载其 config.json 后可用，显示音频播放器、实际波形和音轨。
- video-player：在管理器加载其 config.json 后可用，显示视频播放器与视频/音频双轨布局。双轨是预览示例，不是剪辑系统；音频轨是否实际存在未做容器解析，界面明确标注占位。
- map：未声明 resources，仍可从空白地图开始编辑，拖入文件不会自动创建内容。

Windows 打包目录旁附带 canvas_moudles，包含上述示例、SDK 和文档；外部模块仍必须通过主菜单模块管理器加载。
