# 目录边界

```text
AssetTool/
├─ scripts/
│  ├─ src/                            核心与宿主
│  │  ├─ core/framework/              通用处理与推理协议
│  │  ├─ extensions/
│  │  │  ├─ adapters/                 内置能力桥接
│  │  │  ├─ canvas/                   Canvas 加载、校验与协议
│  │  │  ├─ system/                   系统扩展启动加载与面板协议
│  │  │  └─ navigation.ts             统一导航规则
│  │  ├─ main/                        Electron 应用入口
│  │  └─ renderer/                    工作区与界面承载
│  ├─ extensions/                     正式扩展，与 src 并列
│  │  ├─ sdk/                         公开接口
│  │  ├─ builtin/                     固有导航声明
│  │  ├─ system_modules/              用户加入的系统扩展
│  │  └─ canvas_moudles/
│  │     └─ image/
│  │        ├─ config.json
│  │        └─ modules/
│  │           ├─ processing/         图片算法
│  │           └─ background-removal/
│  │              └─ rembg/           配置、脚本、本地模型环境
│  ├─ build/                          构建与发布工具
│  └─ tests/                          自动检查
├─ test/
│  └─ extensions/                     手动接入练习包，不自动加载
│     ├─ system_modules/preferences/
│     └─ canvas_moudles/              map、audio-player、video-player
├─ node_modules/                      npm 依赖，不是业务源码
├─ dist/                              编译产物
└─ release/                           EXE 与 scripts/extensions
```

业务子目录统一使用 `modules`；`canvas_moudles` 保留既有兼容拼写。画布能力放在自己的 `<画布>/modules/<能力>/`，不放进核心。

`scripts/src/extensions` 是核心的扩展宿主机制；`scripts/extensions` 是被加载的扩展内容。adapters 负责桥接，具体算法和第三方库属于各自模块。公开接口位于 SDK，扩展不应直接依赖宿主私有实现。

发布时维持 `scripts/extensions` 层级；本地 `.venv`、rembg 模型权重及缓存不默认捆绑。安装版在 `resources/scripts/extensions` 下保持相同层级。可信内置 Node 后端仍随程序编译，不会给普通扩展开放 Node/Python 权限。

根目录 `test/extensions` 的内容必须由用户手动合并到正式目录，再按加载规则接入。系统扩展重启发现，Canvas 扩展通过模块管理器选择 config.json 注册。默认软件没有示例导航或示例 Canvas 注册。
