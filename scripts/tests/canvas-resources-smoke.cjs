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
app.setPath("userData", path.resolve(`.cache/resource-profile-${process.pid}`));
const timer = setTimeout(() => {
  console.error("Resource smoke timed out");
  app.exit(1);
}, 45000);
app
  .whenReady()
  .then(async () => {
    const root = path.resolve(`.cache/resource-fixtures-${process.pid}`);
    const moduleRoot = path.join(root, "reader");
    await fs.mkdir(moduleRoot, { recursive: true });
    await fs.writeFile(
      path.join(moduleRoot, "config.json"),
      JSON.stringify({
        schemaVersion: 1,
        sdkVersion: 1,
        id: "reader",
        name: "文本接入测试",
        desc: "",
        version: "1",
        entry: "./index.js",
        resources: [
          {
            extensions: ["txt"],
            handler: "reader.open",
            mode: "replace",
            maxCount: 2,
          },
        ],
      })
    );
    await fs.writeFile(
      path.join(moduleRoot, "index.js"),
      `export default {activate(context){let text;let disposes=0;context.root.textContent='等待资源';context.resources.registerHandler('reader.open',{async canAccept(refs){text=new TextDecoder().decode(await context.resources.read(refs[0].id));return {accepted:text!=='reject',reason:'业务拒绝内容'}},async open(refs){await new Promise(r=>setTimeout(r,150));await context.resources.read(refs[0].id);context.root.textContent=text;context.root.dataset.file=refs[0].name;context.root.dataset.ids=refs.map(r=>r.id).join(',');context.root.dataset.disposes=String(disposes)},dispose(){disposes++}})}}`
    );
    for (const [name, content] of [
      ["a.txt", "first"],
      ["b.txt", "second"],
      ["reject.txt", "reject"],
    ])
      await fs.writeFile(path.join(root, name), content);
    await build({
      entryPoints: {
        canvasModules: "scripts/src/extensions/canvas/host.ts",
        canvasModuleManager: "scripts/src/extensions/canvas/manager.ts",
        assetImport: "scripts/src/main/assetImport.ts",
      },
      outdir: path.join(root, "compiled"),
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      outExtension: { ".js": ".cjs" },
    });
    const { CanvasModuleManager } = require(path.join(
      root,
      "compiled/canvasModuleManager.cjs"
    ));
    const { createAssetImporter } = require(path.join(
      root,
      "compiled/assetImport.cjs"
    ));
    const manager = new CanvasModuleManager(path.join(root, "installed.json"));
    await manager.install(path.join(moduleRoot, "config.json"));
    const assets = new Map();
    const wav = Buffer.alloc(44 + 1600);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(1600, 40);
    for (let i = 0; i < 800; i++)
      wav.writeInt16LE(
        Math.round(Math.sin((i * Math.PI * 2 * 440) / 8000) * 12000),
        44 + i * 2
      );
    await fs.writeFile(path.join(root, "tone.wav"), wav);
    const imported = await createAssetImporter(assets)(
      ["a.txt", "b.txt", "reject.txt", "tone.wav"].map((name) =>
        path.join(root, name)
      ),
      false
    );
    require(path.join(
      root,
      "compiled/canvasModules.cjs"
    )).registerCanvasDocuments(manager, assets);
    ipcMain.handle("systemExtensions.snapshot", () => []);
    ipcMain.handle("canvasModules.list", () => manager.list());
    ipcMain.handle("canvasModules.payload", (_, id) => manager.payload(id));
    ipcMain.handle("canvasModules.install", () =>
      manager.install(path.resolve("test/extensions/canvas_moudles/audio-player/config.json"))
    );
    ipcMain.handle("definitions", () => []);
    ipcMain.handle("import", () => imported);
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
    await win.webContents.executeJavaScript(`(async()=>{
    const pause=(ms=200)=>new Promise(r=>setTimeout(r,ms)); const check=(c,m)=>{if(!c)throw Error(m)};
    const click=(text,root=document)=>{const e=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text);check(e,'Missing '+text);e.click()};
    await pause(); const panel=document.querySelector('.generic-panel');click('编辑',panel);click('类型',panel);await pause();click('文本接入测试',panel);await pause(500);
    click('文件',document.querySelector('.dock-app > .main-menu'));click('导入…');await pause();click('选择文件…');await pause();
    const first=[...document.querySelectorAll('.asset')].find(e=>e.textContent.includes('a.txt'));first.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await pause(500);
    check(!document.body.textContent.includes('资源入口未注册'),'reader failed to register');
  })()`);
    let frame = win.webContents.mainFrame.frames[0];
    const content = () =>
      frame.executeJavaScript(
        "({text:document.getElementById('root').textContent,file:document.getElementById('root').dataset.file,disposes:document.getElementById('root').dataset.disposes,ids:document.getElementById('root').dataset.ids})"
      );
    if ((await content()).text !== "first")
      throw Error("Double-click did not route through module resource handler");
    const refs = imported.map((a) => ({ id: a.id, name: a.name }));
    const drop = async (ids) =>
      win.webContents.executeJavaScript(
        `(async()=>{const t=new DataTransfer();t.setData('application/assetflow-assets',${JSON.stringify(
          JSON.stringify(ids)
        )});document.querySelector('.generic-panel').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:t}));await new Promise(r=>setTimeout(r,400))})()`
      );
    await drop([refs[0].id, refs[1].id]);
    if ((await content()).ids !== [refs[0].id, refs[1].id].join(","))
      throw Error("Same first resource incorrectly suppressed a batch open");
    await drop([refs[2].id]);
    if (
      (await content()).text !== "first" ||
      (await content()).disposes !== "1"
    )
      throw Error("Rejected input destroyed current document");
    await drop([refs[0].id, refs[1].id, refs[2].id]);
    if ((await content()).text !== "first") throw Error("Batch limit ignored");
    await drop([refs[1].id]);
    if (
      (await content()).text !== "second" ||
      (await content()).disposes !== "2"
    )
      throw Error("Replacement did not dispose/open correctly");
    const denied = await frame.executeJavaScript(
      `new Promise(resolve=>{const listener=e=>{if(e.data?.type==='resource-read-result'&&e.data.value.requestId===999){removeEventListener('message',listener);resolve(e.data.value.error)}};addEventListener('message',listener);parent.postMessage({channel:'assetflow.canvas.v1',type:'resource-read',value:{id:${JSON.stringify(
        refs[0].id
      )},requestId:999}},'*')})`
    );
    if (!denied?.includes("未授权"))
      throw Error("Previous resource grant was not revoked");
    await win.webContents.executeJavaScript(
      `(async()=>{const drop=id=>{const t=new DataTransfer();t.setData('application/assetflow-asset',id);document.querySelector('.generic-panel').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:t}))};drop(${JSON.stringify(
        refs[0].id
      )});setTimeout(()=>drop(${JSON.stringify(
        refs[1].id
      )}),20);await new Promise(r=>setTimeout(r,1000))})()`
    );
    if ((await content()).text !== "second")
      throw Error("Concurrent opens overwrote the next resource grant");

    await win.webContents.executeJavaScript(
      `(async()=>{const panel=document.querySelector('.generic-panel');[...panel.querySelectorAll('button[aria-haspopup="menu"]')].find(e=>e.textContent.trim()==='编辑').click();[...panel.querySelectorAll('button[aria-haspopup="menu"]')].find(e=>e.textContent.trim()==='类型').click();await new Promise(r=>setTimeout(r,100));[...panel.querySelectorAll('button')].find(e=>e.textContent.trim()==='flow').click();await new Promise(r=>setTimeout(r,150));const t=new DataTransfer();t.setData('application/assetflow-asset',${JSON.stringify(
        refs[0].id
      )});const over=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:t});panel.dispatchEvent(over);if(over.defaultPrevented)throw Error('Unconfigured canvas accepted drag');panel.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:t}));await new Promise(r=>setTimeout(r,100));if(document.querySelector('iframe'))throw Error('Unconfigured canvas created content')})()`
    );
    await win.webContents.executeJavaScript(
      `(async()=>{const pause=ms=>new Promise(r=>setTimeout(r,ms));const click=(text,root=document)=>{const e=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text);if(!e)throw Error('Missing '+text);e.click()};click('包管理器',document.querySelector('.dock-app > .main-menu'));await pause(100);document.querySelector('[aria-label="添加模块配置"]').click();await pause(250);click('×',document.querySelector('.module-manager'));click('编辑',document.querySelector('.generic-panel'));click('类型',document.querySelector('.generic-panel'));await pause(100);click('音频预览',document.querySelector('.generic-panel'));await pause(500);[...document.querySelectorAll('.asset')].find(e=>e.textContent.includes('tone.wav')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await pause(700)})()`
    );
    const audioFrame = win.webContents.mainFrame.frames[0];
    const audio = await audioFrame.executeJavaScript(
      "({player:document.querySelector('audio')?.src.startsWith('blob:'),wave:document.querySelector('canvas')?.width,text:document.body.textContent})"
    );
    if (!audio.player || audio.wave !== 800 || !audio.text.includes("秒"))
      throw Error(
        "Audio example failed actual WAV decode/waveform: " +
          JSON.stringify(audio)
      );
    if (
      errors.some((message) =>
        /Uncaught|TypeError|Refused|Maximum update/.test(message)
      )
    )
      throw Error(errors.join("\n"));
    clearTimeout(timer);
    console.log(
      "Canvas resources smoke passed: registered open, binary grant, double-click, strict batch, business rejection, replacement disposal, stale-grant denial, unconfigured drop refusal."
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
