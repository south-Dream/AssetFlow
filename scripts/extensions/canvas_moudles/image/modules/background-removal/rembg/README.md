# rembg 接入包

本目录统一保存第三方接入：`adapter.ts` 为 TypeScript 适配器，`runner.py` 为私有进程桥接，模型配置的唯一源码为 `scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/config.json`，`.venv/` 为 Python 环境，`models/` 为权重，`temp/` 为任务临时文件。第三方库通过 pip 安装到本目录的环境，不复制进通用核心。

## 安装（在项目根目录 PowerShell 中执行）

```powershell
python -m venv scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/.venv
scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/.venv/Scripts/python.exe -m pip install -r scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/requirements.txt
New-Item -ItemType Directory -Force scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/models
Invoke-WebRequest -Uri https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx -OutFile scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/models/u2netp.onnx
Get-FileHash scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/models/u2netp.onnx -Algorithm MD5
```

预期 MD5：`8e83ca70e441ab06c318d82300c84806`。无法下载时可手动放入同一路径。适配器执行前再次检查，不隐式下载。Python 依赖固定为 rembg 2.0.67 CPU 版；其间接依赖尚未生成锁文件。

## 调用

```ts
const { service } = createBackgroundRemoval({ directory: absoluteRembgDirectory });
const result = await service.execute({
  capability: "image.remove-background", version: 1, model: "rembg.u2netp",
  inputs: { image: [{ kind: "image", data: imageBytes }] },
  params: { postProcessMask: false },
}, executionContext, abortController.signal);
```

输入为图片字节 `Uint8Array`；输出 `image` 为保留原有 Alpha 的 PNG 字节，`mask` 为模型预测的灰度 PNG。此媒体载荷契约与现有图片步骤的内部 Context 不同，接入步骤 UI 时需要显式转换。

`directory` 由宿主传入绝对路径；可用 `python` 指定已有解释器。开发版使用本目录，打包版使用 `scripts/extensions/canvas_moudles/image/modules/background-removal/rembg/`，桥接与安装说明会自动复制到 ASAR 外。打包版需在该目录安装 `.venv` 并放置 `models/u2netp.onnx`，Python 环境和权重不会自动捆绑。安装目录需要可写，也可通过 `ASSETFLOW_REMBG_DIRECTORY` 指定整个接入包目录，通过 `ASSETFLOW_REMBG_PYTHON` 指定解释器。

桌面处理步骤已提供“移除背景”，支持模型选择、平滑蒙版、预览、预设和批量导出。JPEG 输入抠图后默认改为 PNG；若后续显式添加 JPEG 格式转换，透明区域仍会按背景色合成。建议流程：移除背景 → 透明裁剪 → 缩放 → PNG/WebP 导出。取消任务、切换预览和退出导致 Worker 终止时，宿主会清理其登记的 Python 进程。

每个任务启动一个 Python 进程、创建一次 rembg 会话，任务结束自动退出；当前统一服务串行执行，不跨任务缓存模型，以避免首次接入就引入常驻内存和进程管理。取消需传 AbortSignal 才能即时终止子进程；仅 checkCancelled 在阶段边界生效。超时默认 120 秒，可配置。任务临时目录始终清理。

## 扩展规则

同一 rembg 版本支持的模型复用适配器：在 manifest 增加模型 ID、rembg session 名、文件名和可信来源校验和，权重仍放 `models/`。配置不是任意模型的通用兼容承诺，必须先确认 session 的输入输出与当前桥接兼容。当前只启用单主体单蒙版模型。

需要特殊预处理、多蒙版合成、额外依赖或不同接口的模型，在本目录下增加专用适配器子目录，使用新的 adapter ID，并由模块组合入口注册；不修改第三方库源码，也不在核心目录添加 rembg 特例。模型权重授权独立于 rembg 代码授权。

官方参考：

- https://github.com/danielgatis/rembg
- https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py
