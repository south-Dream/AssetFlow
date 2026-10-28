// Runs the actual renderer, preload, module manager and opaque-origin script iframe.
const { app, BrowserWindow, ipcMain, protocol } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { build } = require("esbuild");
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "assetflow-canvas",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setPath(
  "userData",
  path.resolve(`.cache/module-smoke-profile-${process.pid}`)
);
const timer = setTimeout(() => {
  console.error("Module smoke timed out");
  app.exit(1);
}, 45000);
app
  .whenReady()
  .then(async () => {
    await fs.mkdir(".cache", { recursive: true });
    await build({
      entryPoints: ["scripts/src/extensions/canvas/manager.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: ".cache/module-manager-smoke.cjs",
    });
    const { CanvasModuleManager } = require(path.resolve(
      ".cache/module-manager-smoke.cjs"
    ));
    const store = path.join(app.getPath("userData"), "installed.json");
    await fs.rm(store, { force: true });
    const manager = new CanvasModuleManager(store, require("./shipped-records.cjs").defaults);
    await build({
      entryPoints: ["scripts/src/extensions/canvas/host.ts"],
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      outfile: ".cache/module-documents-smoke.cjs",
    });
    require(path.resolve(
      ".cache/module-documents-smoke.cjs"
    )).registerCanvasDocuments(manager);
    ipcMain.handle("systemExtensions.snapshot", () => []);
    ipcMain.handle("canvasModules.list", () => manager.list());
    ipcMain.handle("canvasModules.install", () =>
      manager.install(path.resolve("examples/extensions/canvas_modules/map/config.json"))
    );
    ipcMain.handle("canvasModules.change", (_, action, id) =>
      action === "reload"
        ? manager.reload(id)
        : action === "uninstall"
        ? manager.uninstall(id)
        : manager.setEnabled(id, action === "enable")
    );
    ipcMain.handle("canvasModules.payload", (_, id) => manager.payload(id));
    ipcMain.handle("definitions", () => []);
    let saveDialogs = 0;
    ipcMain.handle("canvasModules.saveDocument", () => {
      saveDialogs++;
      return true;
    });
    const win = new BrowserWindow({
      show: false,
      width: 1500,
      height: 940,
      webPreferences: {
        backgroundThrottling: false,
        preload: path.resolve("dist/node/preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const errors = [];
    win.webContents.on("console-message", (_, level, message) => {
      if (level >= 3) errors.push(message);
    });
    await win.loadFile(path.resolve("dist/ui/index.html"));
    await win.webContents.executeJavaScript(`(async () => {
    const pause = (ms=180) => new Promise(r => setTimeout(r, ms));
    const check = (value,message) => { if (!value) throw Error(message); };
    const click = (text, root=document) => { const el=[...root.querySelectorAll('button,summary')].find(e=>(e.textContent.trim()===text||e.getAttribute('aria-label')===text)); check(el,'Missing: '+text); el.click(); };
    await pause();
    click('包管理器',document.querySelector('.dock-app > .main-menu')); await pause();
    document.querySelector('[aria-label="添加模块配置"]').click(); await pause(400);
    check(document.querySelector('.module-manager').textContent.includes('地图编辑'),'module not installed');
    click('×',document.querySelector('.module-manager')); await pause();
    const first=document.querySelector('.panel-toolbar'); click('编辑',first); click('类型',first); await pause(); click('地图编辑',first); await pause(700);
    const frame=document.querySelector('iframe'); check(frame,'module iframe missing');
    check(frame.getAttribute('sandbox')==='allow-scripts','iframe gained same-origin access');
    check(![...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('模块')),'module activation error');
    const upper=document.querySelector('.inspector-upper');
    check(upper.textContent.includes('网格尺寸')&&!document.querySelector('.inspector-lower h3'),'Canvas properties are not present before tool selection');
    await pause(300);
    const grid=upper.querySelector('input[aria-label="网格尺寸"][type=number]');check(grid,'Custom canvas Drawer did not render');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(grid,'48');grid.dispatchEvent(new Event('input',{bubbles:true}));await pause(300);
    check(upper.querySelector('input[aria-label="网格尺寸"][type=number]').value==='48','Custom Drawer value did not bind back');
    click('重置',upper);await pause(250);check(upper.querySelector('input[aria-label="网格尺寸"][type=number]').value==='32','Drawer button callback failed');
    click('绘制地块',document.querySelector('.generic-panel')); await pause();
    check(document.querySelector('.processors').textContent.includes('地块尺寸'),'tool Inspector missing');
    const nav=document.querySelector('.panel-toolbar .navigation-container');
    const roots=[...nav.querySelectorAll(':scope > .navigation-node > button')];
    check(roots[0]?.dataset.navId==='system.edit'&&roots.some(button=>button.dataset.navId==='map.menu'),'Canvas system nodes must precede module nodes');
    const boxes=roots.map(button=>button.getBoundingClientRect());
    check(boxes.every(box=>box.top===boxes[0].top)&&boxes[1].left-boxes[0].right<10,'Canvas navigation must be one contiguous row');
    check(!nav.querySelector('[data-nav-region]'),'Legacy Canvas regions remain');
    await pause(250);const brush=document.querySelector('.inspector-lower input[aria-label="地块尺寸"][type=number]');check(brush,'Operation Drawer did not render');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(brush,'64');brush.dispatchEvent(new Event('input',{bubbles:true}));await pause(250);check(document.querySelector('.inspector-lower input[aria-label="地块尺寸"][type=number]').value==='64'&&upper.querySelector('input[aria-label="网格尺寸"][type=number]').value==='32','Canvas and operation Drawer bindings interfered');
    click('应用',document.querySelector('.processors')); await pause();
    check(!document.querySelector('.processors h3'),'tool did not finish');
    click('编辑',document.querySelector('.panel-toolbar')); click('设置…',document.querySelector('.panel-toolbar')); await pause();
    check(document.querySelector('.unified-settings .settings-columns'),'unified settings missing');
    check(document.querySelector('.shortcut-row'),'config tools not shown in settings');
    click('×',document.querySelector('.unified-settings')); await pause();
    click('包管理器',document.querySelector('.dock-app > .main-menu')); await pause();
    document.querySelector('[data-module-id="map"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:250}));await pause();check(document.querySelectorAll('.module-context-menu button').length>0&&[...document.querySelectorAll('.module-context-menu button')].every(b=>b.disabled),'in-use module can be unloaded');
    click('×',document.querySelector('.module-manager')); await pause();
    check(!document.body.textContent.includes('命令未注册'),'command failed');
  })()`);
    const frames = win.webContents.mainFrame.frames;
    if (!frames.length) throw Error("No sandbox frame");
    const isolation = await frames[0].executeJavaScript(
      `({ activated: !!document.querySelector('canvas'), node: typeof require, bridge: typeof window.assetFlow, hostReadable: (()=>{try{return !!parent.document.body}catch{return false}})() })`
    );
    if (
      !isolation.activated ||
      isolation.node !== "undefined" ||
      isolation.bridge !== "undefined" ||
      isolation.hostReadable
    )
      throw Error(
        "Sandbox check failed: " +
          JSON.stringify(isolation) +
          " logs=" +
          errors.join("\n") +
          " body=" +
          (await frames[0].executeJavaScript("document.body.innerText")) +
          " host=" +
          (await win.webContents.executeJavaScript("document.body.innerText"))
      );
    if (
      errors.some((message) =>
        /Uncaught|TypeError|Maximum update|Refused/.test(message)
      )
    )
      throw Error(errors.join("\n"));
    await win.webContents.executeJavaScript(
      "document.querySelector('.canvas-tool-shortcuts button').click()"
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    await frames[0].executeJavaScript(
      "document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:50,clientY:100}))"
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await win.webContents.executeJavaScript(
      "[...document.querySelector('.processors').querySelectorAll('button')].find(b=>b.textContent==='应用').click()"
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const states = await win.webContents.executeJavaScript(
      "Object.keys(localStorage).filter(key=>key.startsWith('assetflow.document.map.')).map(key=>JSON.parse(localStorage.getItem(key)))"
    );
    if (!states.some((state) => state?.tiles?.length === 1))
      throw Error("Applied module state was not saved");
    await win.webContents.executeJavaScript(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'S',ctrlKey:true,shiftKey:true,cancelable:true}))"
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (saveDialogs !== 0)
      throw Error(
        "Tool shortcut Ctrl+Shift+S incorrectly opened the system save dialog"
      );
    const cleared = await win.webContents.executeJavaScript(
      "Object.keys(localStorage).filter(key=>key.startsWith('assetflow.document.map.')).map(key=>JSON.parse(localStorage.getItem(key)))"
    );
    if (!cleared.some((state) => state?.tiles?.length === 0))
      throw Error("Configured Ctrl+Shift+S command did not execute");
    if (
      errors.some((message) =>
        /Uncaught|TypeError|Maximum update|Refused/.test(message)
      )
    )
      throw Error(errors.join("\n"));
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fs.writeFile(
      ".cache/canvas-modules-smoke.png",
      (await win.webContents.capturePage()).toPNG()
    );
    clearTimeout(timer);
    console.log(
      "Canvas module UI smoke passed: manager install, dynamic type, sandbox activation, tools, Inspector, settings, in-use guard, isolation."
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
