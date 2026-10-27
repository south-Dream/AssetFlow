const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const { build } = require("esbuild");
const fs = require("node:fs/promises"),
  path = require("node:path");
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "assetflow-canvas",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setPath("userData", path.resolve(`.cache/drawer-profile-${process.pid}`));
const timeout = setTimeout(() => {
  console.error("Drawer smoke timed out");
  app.exit(1);
}, 40000);
app
  .whenReady()
  .then(async () => {
    const root = path.resolve(`.cache/drawer-fixture-${process.pid}`),
      directory = path.join(root, "probe");
    await fs.mkdir(directory, { recursive: true });
    const field = (id, name) => ({
      id: `probe.${id}`,
      name,
      type: "number",
      default: 10,
      min: 0,
      max: 100,
      renderer: "probe.drawer",
    });
    await fs.writeFile(
      path.join(directory, "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        sdkVersion: 1,
        id: "probe",
        name: "绘制测试",
        desc: "",
        version: "1",
        entry: "./index.js",
        tools: [
          {
            id: "probe.edit",
            command: "probe.edit",
            name: "编辑",
            fields: [field("tool", "操作值")],
          },
        ],
        inspector: {
          canvas: [
            field("good", "常驻值"),
            field("bad", "失败字段"),
            field("tree", "无效树字段"),
            field("slow", "超时字段"),
          ],
        },
      })
    );
    await fs.writeFile(
      path.join(directory, "index.js"),
      `export default {activate(context){let disposed=0;context.root.textContent='probe active';context.registerCommand('probe.edit',()=>{});context.onCanvasProperties(values=>context.root.dataset.value=String(values['probe.good']));context.registerDrawer('probe.drawer',{async draw(ctx){ctx.onDispose(()=>{context.root.dataset.disposed=String(++disposed);if(ctx.field.id==='probe.slow')context.root.dataset.slowDisposed='yes'});if(ctx.field.id==='probe.bad')throw Error('EXPECTED_FIELD_ERROR');if(ctx.field.id==='probe.tree')return {kind:'row',children:'invalid'};if(ctx.field.id==='probe.slow')await new Promise(()=>{});return ctx.ui.row([ctx.ui.input({value:ctx.value,onChange:ctx.setValue}),ctx.ui.button({label:'重置',onClick:()=>ctx.setValue(10)})])}})}}`
    );
    await build({
      entryPoints: {
        canvasModules: "scripts/src/extensions/canvas/host.ts",
        canvasModuleManager: "scripts/src/extensions/canvas/manager.ts",
      },
      outdir: path.join(root, "compiled"),
      bundle: true,
      platform: "node",
      packages: "external",
      format: "cjs",
      outExtension: { ".js": ".cjs" },
    });
    const { CanvasModuleManager } = require(path.join(
      root,
      "compiled/canvasModuleManager.cjs"
    ));
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await manager.install(path.join(directory, "config.json"));
    require(path.join(
      root,
      "compiled/canvasModules.cjs"
    )).registerCanvasDocuments(manager);
    ipcMain.handle("systemExtensions.snapshot", () => []);
    ipcMain.handle("canvasModules.list", () => manager.list());
    ipcMain.handle("canvasModules.payload", (_, id) => manager.payload(id));
    ipcMain.handle("definitions", () => []);
    const win = new BrowserWindow({
      show: false,
      width: 1500,
      height: 940,
      webPreferences: {
        preload: path.resolve("dist/node/preload/index.js"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    const errors = [];
    win.webContents.on("console-message", (_, level, message) => {
      if (level >= 3) errors.push(message);
    });
    await win.loadFile(path.resolve("dist/ui/index.html"));
    await win.webContents.executeJavaScript(
      `(async()=>{const pause=(ms=200)=>new Promise(r=>setTimeout(r,ms));const click=(text,root=document)=>{const e=[...root.querySelectorAll('summary,button')].find(e=>e.textContent.trim()===text||e.getAttribute('aria-label')===text);if(!e)throw Error('Missing '+text);if(e.tagName!=='SUMMARY'||!e.parentElement.open)e.click()};await pause();const panel=document.querySelector('.generic-panel');click('编辑',panel);click('类型',panel);click('绘制测试',panel);await pause(700);if(!document.querySelector('.inspector-upper').textContent.includes('EXPECTED_FIELD_ERROR'))throw Error('Drawer failure not isolated');if(!document.querySelector('.inspector-upper').textContent.includes('无效绘制子项'))throw Error('Invalid tree not rejected');const input=document.querySelector('input[aria-label="常驻值"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'25');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(300);click('编辑',panel.querySelector('.canvas-toolbox'));await pause(300);if(!document.querySelector('.inspector-lower input[aria-label="操作值"]'))throw Error('Operation Drawer missing');click('取消',document.querySelector('.inspector-lower'));await pause(200)})()`
    );
    const frame = win.webContents.mainFrame.frames[0];
    const state = await frame.executeJavaScript(
      "({value:document.getElementById('root').dataset.value,disposed:Number(document.getElementById('root').dataset.disposed),text:document.body.textContent})"
    );
    if (
      state.value !== "25" ||
      state.disposed < 3 ||
      !state.text.includes("probe active")
    )
      throw Error(
        "Drawer binding or failure cleanup failed: " + JSON.stringify(state)
      );
    await new Promise((r) => setTimeout(r, 10500));
    const slow = await frame.executeJavaScript(
      "document.getElementById('root').dataset.slowDisposed"
    );
    const visibleError = await win.webContents.executeJavaScript(
      "document.querySelector('.inspector-upper').textContent.includes('字段绘制超时')"
    );
    if (slow !== "yes" || !visibleError)
      throw Error("Timed-out Drawer did not dispose its subscription");
    if (
      errors.some((message) =>
        /Uncaught|TypeError|Maximum update/.test(message)
      )
    )
      throw Error(errors.join("\n"));
    clearTimeout(timeout);
    console.log(
      "Inspector Drawer smoke passed: canvas binding, operation container, error isolation, invalid-tree rejection, cancellation cleanup, timeout cleanup."
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
