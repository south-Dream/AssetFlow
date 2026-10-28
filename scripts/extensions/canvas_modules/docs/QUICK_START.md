# 新增 Canvas

1. 创建模块目录和 config.json，声明唯一 ID、文件入口、resources 输入规则、tools 和 inspector.canvas 参数。
2. 继承 CanvasBase，实现画布 draw、基础属性 drawProperties、输入、快照恢复、清空、保存和清理接口。
3. 普通动作继承 NavNode 实现 name/trigger；带 Inspector 参数的工具继承 ToolNode，实现 name/draw，必要时实现 onTrigger。不要覆盖工具 trigger。
4. 在 Canvas.drawProperties 或 ToolNode.draw 内使用 context.fields 绘制普通字段，特殊 UI 用 context.ui。字段不是 Node，不存在 renderer 注册接口。
5. bindings 只声明 canvas 和 nodes，将每个工具 ID 映射到类。使用 defineCanvasModule 导出 v3 类表；浏览器原生 JS 示例可从 assetFlowCanvasSDK 取基类。
6. 从包管理器安装配置，选择新 Canvas 类型后验证拖入文件、导航、快捷入口、Inspector、撤销、保存和关闭。

宿主自动提供布局、编辑菜单、设置入口、快捷键、工具快捷栏和 Inspector 接线。不要在工具栏重复加入保存、导出、撤销、清空。

完整边界见 [CLASS_CONTRACT.md](CLASS_CONTRACT.md)，可运行示例见 examples/extensions/canvas_modules/map、audio-player 和 video-player。
