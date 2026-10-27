const { app, BrowserWindow, ipcMain } = require("electron");
const { build } = require("esbuild");
const path = require("node:path");
const fs = require("node:fs/promises");
app.disableHardwareAcceleration();
app.setPath(
  "userData",
  path.resolve(`.cache/image-editor-profile-${process.pid}`)
);
const timeout = setTimeout(() => {
  console.error("Image editor smoke timeout");
  app.exit(1);
}, 30000);
app
  .whenReady()
  .then(async () => {
    await build({
      entryPoints: ["scripts/src/core/registry.ts"],
      outfile: ".cache/image-editor-definitions.cjs",
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
    });
    const { definitions } = require(path.resolve(
      ".cache/image-editor-definitions.cjs"
    ));
    const image = await require("sharp")({
      create: { width: 256, height: 128, channels: 4, background: "#8cba90" },
    })
      .png()
      .toBuffer();
    const source = {
      id: "image",
      path: "C:/fixtures/editor.png",
      root: "C:/fixtures",
      name: "editor.png",
      format: "png",
      width: 256,
      height: 128,
      size: image.length,
      thumbnail: "",
    };
  let previews = 0;
  const previewSteps = [];
  let exported;
  let saves = 0;
  ipcMain.handle("workspace.saveImage", (_, id, steps, revision) => { saves++; return { ...source, revision: revision + 1 }; });
  ipcMain.handle("exportHierarchy", (_, items, folders, name, zip, imageOptions) => { exported = { items, folders, name, zip, imageOptions }; return "C:/exports/test.zip"; });
    ipcMain.handle("systemExtensions.snapshot", () => []);
    ipcMain.handle("canvasModules.list", () => []);
    ipcMain.handle("definitions", () => definitions);
    ipcMain.handle("import", () => [source]);
  ipcMain.handle("preview", (_, _id, steps) => {
      previews++;
    previewSteps.push(structuredClone(steps));
      return {
        url: "data:image/png;base64," + image.toString("base64"),
        width: 256,
        height: 128,
        name: source.name,
        format: "png",
        warnings: [],
      };
    });
    ipcMain.handle("previewCount", () => previews);
    const win = new BrowserWindow({
      show: false,
      width: 1500,
      height: 940,
      webPreferences: {
        preload: path.resolve("dist/node/preload/index.js"),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    const errors = [];
    win.webContents.on("console-message", (_, level, text) => {
      if (level >= 3) errors.push(text);
    });
    await win.loadFile(path.resolve("dist/ui/index.html"));
    await win.webContents.executeJavaScript(`(async()=>{
    const pause=(ms=180)=>new Promise(r=>setTimeout(r,ms)); const check=(c,m)=>{if(!c)throw Error(m)};
    const click=(text,root=document)=>{const el=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text||e.getAttribute('aria-label')===text);check(el,'Missing '+text);if(el.tagName!=='SUMMARY'||!el.parentElement.open)el.click()};
    await pause();const panel=document.querySelector('.generic-panel');
    check(!panel.querySelector('button[aria-label="格式转换"],button[aria-label="重命名"]'),'Output choices remain in tool rail');
    const crop=panel.querySelector('button[aria-label="裁剪"]');check(!crop.hasAttribute('title'),'Duplicate native tooltip is still enabled');crop.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await pause();
    check(document.querySelector('[role=tooltip]')?.textContent.includes('裁剪')&&document.querySelector('[role=tooltip]').textContent.includes('拖动'),'Visible name/description tooltip missing');
    const tipStyle=getComputedStyle(document.querySelector('[role=tooltip]'));check(tipStyle.backgroundColor!=='rgba(0, 0, 0, 0)'&&tipStyle.color!=='rgb(0, 0, 0)','Tooltip has transparent background or black text');
    crop.dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));
    click('文件',document.querySelector('.dock-app > .main-menu'));click('导入…');await pause();click('选择文件…',document.querySelector('[aria-label="导入资源"]'));await pause();document.querySelector('.asset').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await pause(500);click('裁剪',panel);await pause(500);
    check(panel.querySelector('.edit-image'),'Crop input missing');
    check(!panel.querySelector('.edit-toolbar,.edit-actions,.resize-presets,input'),'Canvas still contains editing parameter controls');
    check(document.querySelector('.inspector-lower .parameters input'),'Inspector tool fields missing');
    check(!document.querySelector('.steps,.history-toggle'),'Inspector still displays operation history');
    const widthLabel=[...document.querySelectorAll('.inspector-lower label')].find(e=>e.querySelector('span')?.textContent==='宽度');const input=widthLabel.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'64');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(300);check(input.value==='64','Crop parameters reset during preview');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'9999');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();check([...document.querySelector('.inspector-lower').querySelectorAll('button')].find(e=>e.textContent==='应用').disabled,'Out-of-bounds crop can be committed');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'64');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();
    const upper=document.querySelector('.inspector-upper'),lower=document.querySelector('.inspector-lower');check(getComputedStyle(upper).overflowY==='auto'&&getComputedStyle(lower).overflowY==='auto','Inspector sections do not scroll independently');
    const separator=document.querySelector('.inspector-resizer'),before=upper.getBoundingClientRect().height,y=separator.getBoundingClientRect().top;separator.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientY:y}));window.dispatchEvent(new PointerEvent('pointermove',{clientY:y+50}));window.dispatchEvent(new PointerEvent('pointerup'));await pause();check(upper.getBoundingClientRect().height>before+30,'Inspector divider does not resize');
  })()`);
  await win.webContents.executeJavaScript(`(async()=>{const pause=(ms=220)=>new Promise(r=>setTimeout(r,ms));const check=(c,m)=>{if(!c)throw Error(m)};const panel=document.querySelector('.generic-panel');panel.querySelector('button[aria-label="旋转翻转"]').click();await pause();const dialog=document.querySelector('[aria-label="切换编辑工具"]');check(dialog,'Dirty tool switch did not ask to apply/discard');check(document.querySelector('.inspector-lower').textContent.includes('裁剪'),'Inspector switched before decision');[...dialog.querySelectorAll('button')].find(e=>e.textContent==='放弃修改并切换').click();await pause(400);check(document.querySelector('.inspector-lower').textContent.includes('旋转'),'Inspector did not follow accepted tool');panel.querySelector('button[aria-label="透明裁剪"]').click();await pause(350);check(!document.querySelector('[aria-label="切换编辑工具"]')&&document.querySelector('.inspector-lower').textContent.includes('透明裁剪'),'Unmodified tool switch did not happen immediately')})()`);
  const before = previews;
    await new Promise((r) => setTimeout(r, 500));
  if (previews !== before)
      throw Error(`Crop input repeatedly reloads: ${before} -> ${previews}`);
  await win.webContents.executeJavaScript(`(async()=>{const pause=(ms=350)=>new Promise(r=>setTimeout(r,ms));const check=(c,m)=>{if(!c)throw Error(m)};const panel=document.querySelector('.generic-panel');panel.querySelector('button[aria-label="旋转翻转"]').click();await pause();const angle=[...document.querySelectorAll('.inspector-lower label')].find(e=>e.querySelector('span')?.textContent==='角度').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(angle,'45');angle.dispatchEvent(new Event('input',{bubbles:true}));await pause();panel.querySelector('button[aria-label="透明裁剪"]').click();await pause();let dialog=document.querySelector('[aria-label="切换编辑工具"]');check(dialog,'Changed rotation did not prompt');[...dialog.querySelectorAll('button')].find(e=>e.textContent==='取消').click();await pause();check(document.querySelector('.inspector-lower').textContent.includes('旋转')&&panel.querySelector('button[aria-label="旋转翻转"]').getAttribute('aria-pressed')==='true','Cancel changed the active tool');panel.querySelector('button[aria-label="透明裁剪"]').click();await pause();dialog=document.querySelector('[aria-label="切换编辑工具"]');[...dialog.querySelectorAll('button')].find(e=>e.textContent==='应用并切换').click();await pause(450);check(document.querySelector('.inspector-lower').textContent.includes('透明裁剪')&&panel.querySelector('button[aria-label="透明裁剪"]').getAttribute('aria-pressed')==='true','Apply switch did not synchronize selection')})()`);
  if (!previewSteps.some(steps => steps.some(step => step.processor === "rotate" && step.params.angle === 45))) throw Error("Applying before tool switch did not preserve the rotation");
    await win.webContents.executeJavaScript(
      `(async()=>{const pause=()=>new Promise(r=>setTimeout(r,150));const click=(text,root=document)=>{const el=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text);if(!el)throw Error('Missing '+text);if(el.tagName!=='SUMMARY'||!el.parentElement.open)el.click()};click('应用',document.querySelector('.inspector-lower'));await pause();click('文件',document.querySelector('.dock-app > .main-menu'));click('导出…');await pause();const dialog=document.querySelector('[aria-label="导出资源"]');if(!dialog)throw Error('Export selection panel missing');const imageSettings=dialog.querySelector('.export-image-settings');if(!imageSettings||imageSettings.open)throw Error('Image export settings must start collapsed');click('图片输出设置',imageSettings);await pause();const format=imageSettings.querySelector('[aria-label="输出格式"]'),template=imageSettings.querySelector('[aria-label="文件命名模板"]');if(!imageSettings.open||!format||!template||format.value!=='original'||template.value!=='{name}')throw Error('Image format/naming controls or original-format defaults missing');if([...format.options].map(option=>option.value).join('|')!=='original|png|jpeg|webp')throw Error('Image export formats missing');format.value='webp';format.dispatchEvent(new Event('change',{bubbles:true}));await pause();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(template,'{name}-{width}-{index}');template.dispatchEvent(new Event('input',{bubbles:true}));await pause();const checkbox=dialog.querySelector('.export-selection-tree input[type="checkbox"]');if(!checkbox?.checked||!dialog.querySelector('.export-selection-tree').textContent.includes('editor.png'))throw Error('Current hierarchy asset missing or not checked');const name=dialog.querySelector('.export-name-field input');if(!name)throw Error('Export name field missing');click('清空',dialog);await pause();if(!dialog.querySelector('button[type="submit"]').disabled||checkbox.checked)throw Error('Empty export selection is enabled');click('全选',dialog);await pause();if(dialog.querySelector('button[type="submit"]').disabled||!checkbox.checked)throw Error('Select all did not restore export selection');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'editor-export');name.dispatchEvent(new Event('input',{bubbles:true}));await pause();click('导出',dialog);await pause();const approval=document.querySelector('[aria-label="保存后导出"]');if(approval){click('保存并导出',approval);await pause()}if(document.querySelector('[aria-label="导出资源"]'))throw Error('Export panel did not close after successful export')})()`
    );
    if (!exported || exported.name !== "editor-export" || exported.zip !== true || exported.items.length !== 1 || exported.items[0].id !== source.id) throw Error("Export did not use checked asset and chosen name");
    if (exported.imageOptions?.format !== "webp" || exported.imageOptions?.template !== "{name}-{width}-{index}" || exported.imageOptions?.quality !== 90 || exported.imageOptions?.background !== "#ffffff") throw Error("Image export options were not passed to the host");
    if (saves < 1) throw Error("Dirty canvas was not saved before export");
    if (errors.some((e) => /Uncaught|TypeError|Maximum update/.test(e)))
      throw Error(errors.join("\n"));
    await fs.writeFile(
      ".cache/image-editor-smoke.png",
      (await win.webContents.capturePage()).toPNG()
    );
    clearTimeout(timeout);
    console.log(
      "Image editor smoke passed: real tooltip, stable crop preview, Inspector-only parameters, independent scroll/resize, no history, checked export selection and save-before-export."
    );
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
