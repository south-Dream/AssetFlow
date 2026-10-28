// Browser ESM. Register definitions in activate; create view-owned state in mount.
export function activate(context) {
  context.registerCommand("preferences.notify", async () => {
    const values = await context.getValues("preferences.general");
    context.notify("系统扩展命令已执行" + (values["preferences.author"] ? " · " + values["preferences.author"] : ""));
  });
  context.registerPanel("preferences.customPanel", {
    mount(panel) {
      const heading = document.createElement("h2");
      heading.textContent = "自定义面板";
      const description = document.createElement("p");
      description.textContent = "这个内容由扩展脚本绘制，可承载在设置、独立对话框或停靠区域。";
      const label = document.createElement("label");
      label.textContent = "示例计数";
      const count = document.createElement("input");
      count.type = "number"; count.value = String(panel.values.count ?? 0);
      panel.onDispose(context.onValues(panel.panelId, values => { count.value = String(values.count ?? 0); }));
      label.append(count);
      const save = document.createElement("button");
      save.textContent = "保存示例计数";
      save.onclick = async () => {
        try { await panel.setValues({ count: Number(count.value) }); context.notify("示例计数已保存"); }
        catch (error) { context.notify(String(error)); }
      };
      panel.root.append(heading, description, label, save);
      panel.onDispose(() => { save.onclick = null; });
    }
  });
}
