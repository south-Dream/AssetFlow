# 统一导航：单行节点树

系统顶部与 Canvas 顶部共用 NavNode、单行容器和 MainMenu 绘制器。系统公共节点固定靠前，扩展节点紧接其后，不再区分左、中、右区域。

## 节点与行为

```ts
type NavNode = {
  id: string;
  name: string;
  order?: number;
  children?: NavNode[];
  command?: string;
  action?: { type: "openPanel"; panel: string; host?: "dialog" | "settings" | "dock" };
};
```

children、command、action 三者选一：展开菜单、执行命令或打开面板。任意层级都支持直接动作。扩展通过 menus 声明自己的节点树，不注入 React/DOM 或覆盖导航绘制器。

## 固定装配与排序

- 系统顶部：包管理器、文件、编辑始终按本体顺序在前，系统扩展在后。
- Canvas 顶部：公共编辑菜单始终在前，当前 Canvas 的专属节点在后。
- order 只排序扩展节点及其子树，数值越小越靠前；相同时保留声明/加载顺序。负数也不能排到系统节点前面。
- 系统节点及其子菜单顺序由宿主固定，扩展不能修改。
- 整行从前向后紧邻排列，不换行；空间不足时横向滚动。菜单弹层使用固定定位，滚动时重新定位。

公共协议在 scripts/extensions/sdk/contracts.ts，容器构建器在 sdk/navigation.ts。两个容器只返回 root 节点树，不提供区域配置或区域绘制回调。

## 扩展边界

固有子菜单不能追加、覆盖、删除或重命名。外部只能新增独立一级按钮/菜单树，内部可声明多级节点。parent 是注册关系，可省略、写 system.root，或引用本模块自己的菜单；不能引用其他模块菜单及 system.file、system.edit 等固有节点。

Canvas 工具在“编辑 → 工具”中的入口由宿主按 tools 统一生成，不授予模块修改固有菜单的权限。旧 placement:specific 仍表示独立一级节点；placement:edit 不受支持。

每份扩展最多 200 个导航节点、6 层声明嵌套。系统扩展逐项校验和组装，错误贡献独立报告，不影响其他扩展。

## 旧区域配置迁移

navigation 配置（包括 navigation.regions 和区域 order）已经移除，加载时明确报错。请删除整个 navigation 字段，把扩展节点顺序写在 menus 节点的 order 上。NavNode 的 order 为数值，不是旧区域顺序数组。